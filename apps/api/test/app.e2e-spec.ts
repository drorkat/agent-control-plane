import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SchedulerService } from '../src/schedules/scheduler.service';

/**
 * Integration tests against the real Nest app wired to a real Postgres (a
 * throwaway service in CI). These exercise the full request pipeline — guards,
 * validation, tenant context, the run engine, and the Tool Gateway — that the
 * pure unit tests cannot reach.
 */
describe('ACP API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];

  const uniq = () => Math.random().toString(36).slice(2, 10);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // Rate limiting is verified elsewhere; disable it here so the many logins
      // across these tests never trip the auth throttle and flake.
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      // Don't start the background scheduler timer during tests.
      .overrideProvider(SchedulerService)
      .useValue({ onModuleInit() {}, onModuleDestroy() {} })
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Sign up a fresh owner in a brand-new org; returns a cookie-persisting agent. */
  async function signupOwner() {
    const email = `owner-${uniq()}@e2e.local`;
    const agent = request.agent(server);
    const res = await agent
      .post('/api/auth/signup')
      .send({
        email,
        password: 'password123',
        organizationName: `Org ${uniq()}`,
      })
      .expect(201);
    return { agent, email, user: res.body };
  }

  describe('auth', () => {
    it('signs up an owner, rejects a wrong password, resolves /me', async () => {
      const { user, email } = await signupOwner();
      expect(user.role).toBe('owner');
      expect(user.passwordHash).toBeUndefined();

      await request(server)
        .post('/api/auth/login')
        .send({ email, password: 'wrongpassword' })
        .expect(401);

      const good = request.agent(server);
      await good
        .post('/api/auth/login')
        .send({ email, password: 'password123' })
        .expect(200);
      const me = await good.get('/api/auth/me').expect(200);
      expect(me.body.email).toBe(email);
    });
  });

  describe('RBAC (viewers are read-only)', () => {
    it('403s a viewer on writes but allows reads; owner can write', async () => {
      const { agent: owner } = await signupOwner();

      const vEmail = `viewer-${uniq()}@e2e.local`;
      await owner
        .post('/api/members')
        .send({ email: vEmail, password: 'password123', role: 'viewer' })
        .expect(201);

      const viewer = request.agent(server);
      await viewer
        .post('/api/auth/login')
        .send({ email: vEmail, password: 'password123' })
        .expect(200);

      await viewer.post('/api/projects').send({ name: 'nope' }).expect(403);
      await viewer
        .post('/api/webhooks')
        .send({ url: 'https://x.test/h', events: ['run.completed'] })
        .expect(403);
      await viewer.get('/api/projects').expect(200);

      await owner
        .post('/api/projects')
        .send({ name: 'owner project' })
        .expect(201);
    });
  });

  describe('multi-tenant isolation', () => {
    it('never leaks one org’s projects to another', async () => {
      const a = await signupOwner();
      await a.agent
        .post('/api/projects')
        .send({ name: 'A-SECRET-PROJECT' })
        .expect(201);

      const b = await signupOwner();
      const bProjects = await b.agent.get('/api/projects').expect(200);
      const names = (bProjects.body as Array<{ name: string }>).map(
        (p) => p.name,
      );
      expect(names).not.toContain('A-SECRET-PROJECT');
    });
  });

  describe('gateway governance (real tiers)', () => {
    it('auto-completes a no-repo run with no approval (read_repo → auto)', async () => {
      const { agent } = await signupOwner();
      const project = (
        await agent.post('/api/projects').send({ name: 'NoRepo' }).expect(201)
      ).body;
      const ag = (
        await agent
          .post('/api/agents')
          .send({ name: 'Planner', provider: 'mock', model: 'mock-1' })
          .expect(201)
      ).body;
      const task = (
        await agent
          .post('/api/tasks')
          .send({ title: 'Plan it', projectId: project.id })
          .expect(201)
      ).body;

      const run = (
        await agent
          .post('/api/runs')
          .send({ taskId: task.id, agentId: ag.id })
          .expect(201)
      ).body;
      expect(run.status).toBe('completed');
      const types = (run.events as Array<{ type: string }>).map((e) => e.type);
      expect(types).toContain('RUN_COMPLETED');
      expect(types).not.toContain('APPROVAL_REQUESTED');
    });

    it('parks a repo-linked run for approval (open_pull_request → approval)', async () => {
      const { agent } = await signupOwner();
      const project = (
        await agent.post('/api/projects').send({ name: 'WithRepo' }).expect(201)
      ).body;
      // Link a repo directly (the GitHub connect flow is out of scope here);
      // GITHUB_MOCK=1 provides a mock client so the loop runs offline.
      await prisma.project.update({
        where: { id: project.id },
        data: { repoOwner: 'acme', repoName: 'web' },
      });
      const ag = (
        await agent
          .post('/api/agents')
          .send({ name: 'Coder', provider: 'mock', model: 'mock-1' })
          .expect(201)
      ).body;
      const task = (
        await agent
          .post('/api/tasks')
          .send({ title: 'Edit code', projectId: project.id })
          .expect(201)
      ).body;

      const run = (
        await agent
          .post('/api/runs')
          .send({ taskId: task.id, agentId: ag.id })
          .expect(201)
      ).body;
      expect(run.status).toBe('waiting_approval');
      const types = (run.events as Array<{ type: string }>).map((e) => e.type);
      expect(types).toContain('APPROVAL_REQUESTED');
    });
  });

  describe('pagination', () => {
    it('bounds a list to the requested limit', async () => {
      const { agent } = await signupOwner();
      await agent.post('/api/projects').send({ name: 'P1' }).expect(201);
      await agent.post('/api/projects').send({ name: 'P2' }).expect(201);
      await agent.post('/api/projects').send({ name: 'P3' }).expect(201);

      const page = await agent.get('/api/projects?limit=2').expect(200);
      expect(Array.isArray(page.body)).toBe(true);
      expect(page.body.length).toBe(2);
    });
  });

  describe('scheduler validation', () => {
    it('rejects scheduling a task with no assignable agent', async () => {
      const { agent } = await signupOwner();
      const project = (
        await agent.post('/api/projects').send({ name: 'SchedProj' }).expect(201)
      ).body;
      const task = (
        await agent
          .post('/api/tasks')
          .send({ title: 'Agentless', projectId: project.id })
          .expect(201)
      ).body;
      await agent
        .post('/api/schedules')
        .send({ taskId: task.id, intervalMinutes: 5 })
        .expect(400);
    });
  });
});

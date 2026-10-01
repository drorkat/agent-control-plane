import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SchedulerService } from '../src/schedules/scheduler.service';
import { applyRls, RLS_ORG_GUC } from '../src/prisma/rls';

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

    // Install row-level security on the test database. Because the policy is
    // permissive when the org GUC is unset (and the app never sets it), the whole
    // existing suite below must still pass — that is the non-breaking proof. The
    // dedicated RLS test sets the GUC to prove the policy blocks cross-tenant reads.
    await applyRls(prisma);
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

    type Ev = { type: string; payload?: Record<string, unknown> };

    /**
     * Create a repo-linked project + mock agent + a task titled `title`, then
     * start a run and return the persisted run with its events. The repo link
     * makes the agent loop run (offline, via GITHUB_MOCK); a `[[action:<name>]]`
     * marker in the title drives the mock to request that governed action, which
     * the run engine routes through the Tool Gateway.
     */
    async function startRepoRun(
      agent: ReturnType<typeof request.agent>,
      title: string,
    ) {
      const project = (
        await agent.post('/api/projects').send({ name: `P-${uniq()}` }).expect(201)
      ).body;
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
          .send({ title, projectId: project.id })
          .expect(201)
      ).body;
      return (
        await agent
          .post('/api/runs')
          .send({ taskId: task.id, agentId: ag.id })
          .expect(201)
      ).body;
    }

    it('refuses a blocked action and fails the run (delete_data → blocked)', async () => {
      const { agent } = await signupOwner();
      const run = await startRepoRun(agent, 'Purge records [[action:delete_data]]');

      expect(run.status).toBe('failed');
      const events = run.events as Ev[];
      const blocked = events.find((e) => e.type === 'TOOL_BLOCKED');
      expect(blocked?.payload?.action).toBe('delete_data');
      const types = events.map((e) => e.type);
      expect(types).not.toContain('APPROVAL_REQUESTED');
      expect(types).not.toContain('RUN_COMPLETED');
    });

    it('parks a high-risk action at high risk, then executes it on approval (merge_pull_request → approval/high)', async () => {
      const { agent } = await signupOwner();
      const run = await startRepoRun(
        agent,
        'Merge the release PR [[action:merge_pull_request]]',
      );

      expect(run.status).toBe('waiting_approval');
      const requested = (run.events as Ev[]).find(
        (e) => e.type === 'APPROVAL_REQUESTED',
      );
      expect(requested?.payload?.action).toBe('merge_pull_request');
      expect(requested?.payload?.risk).toBe('high');

      // Approving must resume as the SAME governed action (recorded executed),
      // never silently open a pull request instead.
      const approvalId = requested?.payload?.approvalId as string;
      await agent.post(`/api/approvals/${approvalId}/approve`).expect(201);

      const resumed = (await agent.get(`/api/runs/${run.id}`).expect(200)).body;
      expect(resumed.status).toBe('completed');
      const executed = (resumed.events as Ev[]).find(
        (e) => e.type === 'TOOL_EXECUTED',
      );
      expect(executed?.payload?.action).toBe('merge_pull_request');
      const result = executed?.payload?.result as
        | Record<string, unknown>
        | undefined;
      expect(result?.note).toBe('approved by reviewer');
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
      // The body is capped at the page size, but X-Total-Count reports the full
      // filtered total (this fresh org has exactly 3 projects) so a client can
      // page with a known total.
      expect(page.headers['x-total-count']).toBe('3');
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

  describe('row-level security (defense-in-depth)', () => {
    it('blocks cross-tenant reads at the database when the org GUC is set', async () => {
      // Seed two orgs with a project each directly — this is a database-level
      // test, so it deliberately avoids the (rate-limited) HTTP signup path.
      const orgA = await prisma.organization.create({
        data: { name: 'RLS Org A', slug: `rls-a-${uniq()}` },
      });
      const orgB = await prisma.organization.create({
        data: { name: 'RLS Org B', slug: `rls-b-${uniq()}` },
      });
      await prisma.project.create({
        data: { organizationId: orgA.id, name: 'RLS-A' },
      });
      await prisma.project.create({
        data: { organizationId: orgB.id, name: 'RLS-B' },
      });

      // Without the org GUC the policy is permissive — which is how the app runs
      // by default, and why enabling RLS did not break the suite above: a raw read
      // still sees every org's rows.
      const all = await prisma.$queryRawUnsafe<{ organizationId: string }[]>(
        'SELECT "organizationId" FROM "Project"',
      );
      const allIds = all.map((r) => r.organizationId);
      expect(allIds).toEqual(expect.arrayContaining([orgA.id, orgB.id]));

      // Superusers bypass RLS, so to evaluate the policy we need a non-superuser
      // context. Locally the app role is already non-super (+ FORCE applies to the
      // owner); on the Docker/CI Postgres the app role is a superuser, so create a
      // throwaway non-super role and SET LOCAL ROLE to it inside the probe tx.
      const roleRows = await prisma.$queryRawUnsafe<{ rolsuper: boolean }[]>(
        'SELECT rolsuper FROM pg_roles WHERE rolname = current_user',
      );
      const isSuper = roleRows[0]?.rolsuper === true;
      if (isSuper) {
        await prisma.$executeRawUnsafe(
          `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='acp_rls_probe') THEN CREATE ROLE acp_rls_probe NOSUPERUSER; END IF; END $$;`,
        );
        await prisma.$executeRawUnsafe(
          'GRANT USAGE ON SCHEMA public TO acp_rls_probe',
        );
        await prisma.$executeRawUnsafe(
          'GRANT SELECT ON ALL TABLES IN SCHEMA public TO acp_rls_probe',
        );
      }

      // Read "Project" scoped to one org via the GUC, under a non-super role, all
      // in one transaction so SET LOCAL ROLE + set_config bind to the same
      // connection as the SELECT.
      const projectOrgsSeenBy = (orgId: string): Promise<string[]> =>
        prisma.$transaction(async (tx) => {
          if (isSuper) {
            await tx.$executeRawUnsafe('SET LOCAL ROLE acp_rls_probe');
          }
          await tx.$executeRawUnsafe(
            'SELECT set_config($1, $2, true)',
            RLS_ORG_GUC,
            orgId,
          );
          const rows = await tx.$queryRawUnsafe<{ organizationId: string }[]>(
            'SELECT "organizationId" FROM "Project"',
          );
          return rows.map((r) => r.organizationId);
        });

      const seenByA = await projectOrgsSeenBy(orgA.id);
      expect(seenByA).toContain(orgA.id);
      expect(seenByA).not.toContain(orgB.id); // the DB refused org B's row

      const seenByB = await projectOrgsSeenBy(orgB.id);
      expect(seenByB).toContain(orgB.id);
      expect(seenByB).not.toContain(orgA.id);
    });
  });
});

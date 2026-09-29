import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_ORG_ID } from '../common/tenant';
import { ProviderFactory } from '../ai/provider.factory';
import { computeCostUsd } from '../ai/pricing';

@Injectable()
export class RunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: ProviderFactory,
  ) {}

  /**
   * Start a run: resolve the task and agent, create the Run row, call the LLM,
   * and record the outcome as a stream of RunEvents. Always resolves to the
   * persisted run (via findOne) — a provider failure is captured on the run and
   * its RUN_FAILED event rather than thrown to the caller.
   */
  async start(taskId: string, agentIdOverride?: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organizationId: DEFAULT_ORG_ID },
    });
    if (!task) {
      throw new NotFoundException(`Task "${taskId}" not found`);
    }

    const agentId = agentIdOverride ?? task.assignedAgentId;
    if (!agentId) {
      throw new BadRequestException('Task has no assigned agent');
    }

    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, organizationId: DEFAULT_ORG_ID },
    });
    if (!agent) {
      throw new NotFoundException(`Agent "${agentId}" not found`);
    }

    const run = await this.prisma.run.create({
      data: {
        organizationId: DEFAULT_ORG_ID,
        taskId: task.id,
        agentId: agent.id,
        provider: agent.provider,
        model: agent.model,
        status: 'running',
        startedAt: new Date(),
      },
    });

    await this.addEvent(run.id, 'RUN_CREATED');
    await this.addEvent(run.id, 'MODEL_STARTED');
    await this.prisma.agent.update({
      where: { id: agent.id },
      data: { status: 'working' },
    });

    const system =
      agent.instructions || 'You are a helpful software engineering agent.';
    const prompt =
      task.title + (task.description ? '\n\n' + task.description : '');

    try {
      // The decrypted key lives only inside the provider instance returned here;
      // it is never surfaced back to this service.
      const provider = await this.factory.forAgent(agent);
      const res = await provider.complete({ system, prompt, model: agent.model });

      await this.addEvent(run.id, 'MODEL_RESPONSE', { text: res.text });

      const cost = computeCostUsd(
        agent.model,
        res.inputTokens,
        res.outputTokens,
      );
      await this.prisma.run.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          inputTokens: res.inputTokens,
          outputTokens: res.outputTokens,
          costUsd: cost,
          completedAt: new Date(),
        },
      });
      await this.addEvent(run.id, 'RUN_COMPLETED');
    } catch (err) {
      // Record the failure message only — never any key material.
      const message = err instanceof Error ? err.message : String(err);
      await this.addEvent(run.id, 'RUN_FAILED', { message });
      await this.prisma.run.update({
        where: { id: run.id },
        data: { status: 'failed', completedAt: new Date() },
      });
    } finally {
      await this.prisma.agent.update({
        where: { id: agent.id },
        data: { status: 'idle' },
      });
    }

    return this.findOne(run.id);
  }

  /** All runs in the default org, newest first, with agent/task summaries. */
  findAll() {
    return this.prisma.run.findMany({
      where: { organizationId: DEFAULT_ORG_ID },
      orderBy: { createdAt: 'desc' },
      include: {
        agent: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
      },
    });
  }

  /** A single run scoped to the default org (404), with its events in order. */
  async findOne(id: string) {
    const run = await this.prisma.run.findFirst({
      where: { id, organizationId: DEFAULT_ORG_ID },
      include: {
        events: { orderBy: { createdAt: 'asc' } },
        agent: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
      },
    });
    if (!run) {
      throw new NotFoundException(`Run "${id}" not found`);
    }
    return run;
  }

  /**
   * Append a RunEvent. Payloads must contain no secret material — callers pass
   * only safe, user-facing data (e.g. model text or an error message).
   */
  private addEvent(runId: string, type: string, payload?: Prisma.InputJsonValue) {
    return this.prisma.runEvent.create({
      data: {
        runId,
        type,
        ...(payload !== undefined ? { payload } : {}),
      },
    });
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { currentOrgId } from '../common/tenant';
import { ProviderFactory } from '../ai/provider.factory';
import { computeCostUsd } from '../ai/pricing';
import { GatewayService } from '../gateway/gateway.service';
import { AuditService } from '../audit/audit.service';

// The representative tool action every run proposes in the MVP. Real tool-call
// extraction from the model response comes later; for now the run engine always
// proposes opening a pull request, which the gateway routes to human approval.
const PROPOSED_ACTION = 'open_pull_request';

@Injectable()
export class RunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: ProviderFactory,
    private readonly gateway: GatewayService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Start a run: resolve the task and agent, create the Run row, call the LLM,
   * then route a proposed tool action through the Tool Gateway. Depending on the
   * policy decision the run either completes automatically, is blocked, or is
   * PAUSED at `waiting_approval` for a human (see {@link resume}). The outcome is
   * recorded as a stream of RunEvents plus audit entries. Always resolves to the
   * persisted run (via findOne) — a provider failure is captured on the run and
   * its RUN_FAILED event rather than thrown to the caller.
   */
  async start(taskId: string, agentIdOverride?: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organizationId: currentOrgId() },
    });
    if (!task) {
      throw new NotFoundException(`Task "${taskId}" not found`);
    }

    const agentId = agentIdOverride ?? task.assignedAgentId;
    if (!agentId) {
      throw new BadRequestException('Task has no assigned agent');
    }

    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, organizationId: currentOrgId() },
    });
    if (!agent) {
      throw new NotFoundException(`Agent "${agentId}" not found`);
    }

    const run = await this.prisma.run.create({
      data: {
        organizationId: currentOrgId(),
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

      // Persist token usage / cost now. Whether the run then completes, pauses
      // for approval, or is blocked is decided by the gateway below — the tokens
      // stay written across all of those outcomes.
      const cost = computeCostUsd(
        agent.model,
        res.inputTokens,
        res.outputTokens,
      );
      await this.prisma.run.update({
        where: { id: run.id },
        data: {
          inputTokens: res.inputTokens,
          outputTokens: res.outputTokens,
          costUsd: cost,
        },
      });

      // Route a representative proposed action through the Tool Gateway.
      const action = PROPOSED_ACTION;
      const { decision, risk } = this.gateway.evaluate(action);

      if (decision === 'blocked') {
        await this.addEvent(run.id, 'TOOL_BLOCKED', { action });
        await this.audit.record({
          actorType: 'agent',
          actorId: agent.id,
          action: 'tool.blocked',
          resourceType: 'run',
          resourceId: run.id,
          metadata: { action, risk },
        });
        await this.prisma.run.update({
          where: { id: run.id },
          data: { status: 'failed', completedAt: new Date() },
        });
        await this.prisma.agent.update({
          where: { id: agent.id },
          data: { status: 'idle' },
        });
      } else if (decision === 'approval') {
        // Park the run for a human. The Approval row is what a reviewer resolves
        // via the approvals API, which then calls resume().
        const approval = await this.prisma.approval.create({
          data: {
            organizationId: currentOrgId(),
            runId: run.id,
            actionType: action,
            riskLevel: risk,
            status: 'pending',
            requestedAt: new Date(),
          },
        });
        await this.addEvent(run.id, 'APPROVAL_REQUESTED', {
          approvalId: approval.id,
          action,
          risk,
        });
        await this.audit.record({
          actorType: 'agent',
          actorId: agent.id,
          action: 'approval.requested',
          resourceType: 'approval',
          resourceId: approval.id,
          metadata: { runId: run.id, action, risk },
        });
        await this.prisma.run.update({
          where: { id: run.id },
          data: { status: 'waiting_approval' },
        });
        await this.prisma.agent.update({
          where: { id: agent.id },
          data: { status: 'paused' },
        });
        // Pause: return the parked run WITHOUT completing it. resume() takes
        // over once the approval is decided.
        return this.findOne(run.id);
      } else {
        // decision === 'auto': execute immediately and complete the run.
        await this.addEvent(run.id, 'TOOL_EXECUTED', {
          action,
          result: { note: 'auto-approved by policy' },
        });
        await this.audit.record({
          actorType: 'agent',
          actorId: agent.id,
          action: 'tool.executed',
          resourceType: 'run',
          resourceId: run.id,
          metadata: { action, risk },
        });
        await this.prisma.run.update({
          where: { id: run.id },
          data: { status: 'completed', completedAt: new Date() },
        });
        await this.addEvent(run.id, 'RUN_COMPLETED');
        await this.prisma.agent.update({
          where: { id: agent.id },
          data: { status: 'idle' },
        });
      }
    } catch (err) {
      // Record the failure message only — never any key material.
      const message = err instanceof Error ? err.message : String(err);
      await this.addEvent(run.id, 'RUN_FAILED', { message });
      await this.prisma.run.update({
        where: { id: run.id },
        data: { status: 'failed', completedAt: new Date() },
      });
      await this.prisma.agent.update({
        where: { id: agent.id },
        data: { status: 'idle' },
      });
    }

    return this.findOne(run.id);
  }

  /**
   * Resume a run parked at `waiting_approval` after a reviewer decides. On
   * approval, the proposed action is (mock) executed and the run completes; on
   * rejection the run fails. Either way the agent returns to idle. Records the
   * decision as RunEvents plus an audit entry. Scoped to the default org.
   */
  async resume(runId: string, approved: boolean, resolvedByUserId?: string) {
    const run = await this.prisma.run.findFirst({
      where: { id: runId, organizationId: currentOrgId() },
    });
    if (!run) {
      throw new NotFoundException(`Run "${runId}" not found`);
    }
    if (run.status !== 'waiting_approval') {
      throw new BadRequestException('Run is not awaiting approval');
    }

    const action = PROPOSED_ACTION;

    if (approved) {
      await this.addEvent(runId, 'APPROVAL_RECEIVED');
      // Simulate executing the approved action. Real GitHub integration lands
      // later; the result is a mock so the UI has a link to render.
      const result = {
        pullRequestUrl: 'https://example.com/pull/1',
        note: 'mock — real GitHub comes later',
      };
      await this.addEvent(runId, 'TOOL_EXECUTED', { action, result });
      await this.audit.record({
        actorType: 'user',
        actorId: resolvedByUserId,
        action: 'tool.executed',
        resourceType: 'run',
        resourceId: runId,
        metadata: { action, result },
      });
      await this.addEvent(runId, 'RUN_COMPLETED');
      await this.prisma.run.update({
        where: { id: runId },
        data: { status: 'completed', completedAt: new Date() },
      });
    } else {
      await this.addEvent(runId, 'APPROVAL_REJECTED');
      await this.audit.record({
        actorType: 'user',
        actorId: resolvedByUserId,
        action: 'approval.rejected',
        resourceType: 'run',
        resourceId: runId,
        metadata: { action },
      });
      await this.addEvent(runId, 'RUN_FAILED', {
        message: 'Rejected by reviewer',
      });
      await this.prisma.run.update({
        where: { id: runId },
        data: { status: 'failed', completedAt: new Date() },
      });
    }

    await this.prisma.agent.update({
      where: { id: run.agentId },
      data: { status: 'idle' },
    });

    return this.findOne(runId);
  }

  /** All runs in the default org, newest first, with agent/task summaries. */
  findAll() {
    return this.prisma.run.findMany({
      where: { organizationId: currentOrgId() },
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
      where: { id, organizationId: currentOrgId() },
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

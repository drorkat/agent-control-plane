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
import { GitHubClientFactory } from '../github/github-client.factory';
import { OpenPrFile, OpenPrInput } from '../github/github-client.interface';
import { RepoContextService } from './repo-context.service';
import { buildAgentSystemPrompt, parseChangeProposal } from './change-proposal';
import {
  WebhookDispatcher,
  WebhookEvent,
} from '../webhooks/webhook-dispatcher.service';
import { NotificationsService } from '../notifications/notifications.service';

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
    private readonly github: GitHubClientFactory,
    private readonly repoContext: RepoContextService,
    private readonly webhooks: WebhookDispatcher,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Fan a lifecycle event out to both channels: outbound webhooks (fire-and-
   * forget, signed) and an in-app notification. The organization id is captured
   * synchronously here so the async webhook delivery and notification write bind
   * to the right tenant even after the request context unwinds. Never throws.
   */
  private emit(
    event: WebhookEvent,
    data: Record<string, unknown>,
    notif: { type: string; title: string; body?: string },
  ): void {
    const organizationId = currentOrgId();
    // dispatch() captures the org synchronously and delivers in the background.
    this.webhooks.dispatch(event, data);
    void this.notifications.notify({ ...notif, organizationId });
  }

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

    const baseInstructions =
      agent.instructions || 'You are a helpful software engineering agent.';
    const taskText =
      task.title + (task.description ? '\n\n' + task.description : '');

    // If the task's project is linked to a GitHub repo, read real code as
    // context so the agent proposes actual file edits (not just a plan). When
    // there is no repo (or GitHub can't be reached) we fall back to plain
    // context-free planning and the old proposal-document PR path.
    const project = await this.prisma.project.findFirst({
      where: { id: task.projectId, organizationId: currentOrgId() },
      select: { repoOwner: true, repoName: true },
    });

    let system = baseInstructions;
    let prompt = taskText;
    let hasRepoContext = false;
    if (project?.repoOwner && project?.repoName) {
      const context = await this.repoContext.gather(
        project.repoOwner,
        project.repoName,
        taskText,
      );
      if (context) {
        hasRepoContext = true;
        system = buildAgentSystemPrompt(baseInstructions);
        prompt = `${taskText}\n\n${context.promptSection}`;
        await this.addEvent(run.id, 'CONTEXT_READ', {
          filesRead: context.files.length,
          totalFiles: context.allPaths.length,
        });
      }
    }

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

      // When the agent had repo context, try to parse structured file edits from
      // its response and record them, so the approved PR commits the real
      // changes rather than a proposal document.
      if (hasRepoContext) {
        const proposal = parseChangeProposal(res.text);
        if (proposal && proposal.files.length > 0) {
          const changes: Prisma.InputJsonObject = {
            summary: proposal.summary,
            fileCount: proposal.files.length,
            files: proposal.files.map((f) => ({
              path: f.path,
              content: f.content,
            })),
          };
          await this.addEvent(run.id, 'CHANGES_PROPOSED', changes);
        }
      }

      // Route a representative proposed action through the Tool Gateway.
      const action = PROPOSED_ACTION;
      const { decision, risk } = this.gateway.evaluate(action);

      if (decision === 'blocked') {
        await this.addEvent(run.id, 'TOOL_BLOCKED', { action });
        this.emit(
          'run.failed',
          { runId: run.id, task: task.title, reason: 'blocked_by_policy' },
          { type: 'run.failed', title: 'Run blocked', body: task.title },
        );
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
        this.emit(
          'approval.requested',
          {
            runId: run.id,
            approvalId: approval.id,
            action,
            risk,
            task: task.title,
          },
          {
            type: 'approval.requested',
            title: 'Approval requested',
            body: task.title,
          },
        );
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
        this.emit(
          'run.completed',
          { runId: run.id, task: task.title, status: 'completed' },
          { type: 'run.completed', title: 'Run completed', body: task.title },
        );
        await this.prisma.agent.update({
          where: { id: agent.id },
          data: { status: 'idle' },
        });
      }
    } catch (err) {
      // Record the failure message only — never any key material.
      const message = err instanceof Error ? err.message : String(err);
      await this.addEvent(run.id, 'RUN_FAILED', { message });
      this.emit(
        'run.failed',
        { runId: run.id, task: task.title, message },
        { type: 'run.failed', title: 'Run failed', body: message },
      );
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
      // Now that a human has approved, actually execute the tool: open a real
      // GitHub pull request (branch -> commit -> PR). A failure here (no repo
      // linked, GitHub not connected, or an API error) fails the run cleanly
      // rather than pretending the PR was opened.
      try {
        const result = await this.executeOpenPullRequest(run);
        await this.addEvent(runId, 'TOOL_EXECUTED', { action, result });
        await this.audit.record({
          actorType: 'user',
          actorId: resolvedByUserId,
          action: 'tool.executed',
          resourceType: 'run',
          resourceId: runId,
          metadata: { action, result },
        });
        const prUrl =
          typeof result.pullRequestUrl === 'string'
            ? result.pullRequestUrl
            : undefined;
        if (prUrl) {
          this.emit(
            'pull_request.opened',
            { runId, pullRequestUrl: prUrl },
            {
              type: 'pull_request.opened',
              title: 'Pull request opened',
              body: prUrl,
            },
          );
        }
        await this.addEvent(runId, 'RUN_COMPLETED');
        await this.prisma.run.update({
          where: { id: runId },
          data: { status: 'completed', completedAt: new Date() },
        });
        this.emit(
          'run.completed',
          { runId, status: 'completed' },
          { type: 'run.completed', title: 'Run completed' },
        );
      } catch (err) {
        // The GitHub client never puts token material in its error messages, so
        // this is safe to record and show.
        const message = err instanceof Error ? err.message : String(err);
        await this.audit.record({
          actorType: 'user',
          actorId: resolvedByUserId,
          action: 'tool.failed',
          resourceType: 'run',
          resourceId: runId,
          metadata: { action, message },
        });
        await this.addEvent(runId, 'RUN_FAILED', { message });
        await this.prisma.run.update({
          where: { id: runId },
          data: { status: 'failed', completedAt: new Date() },
        });
        this.emit(
          'run.failed',
          { runId, message },
          { type: 'run.failed', title: 'Run failed', body: message },
        );
      }
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
      this.emit(
        'run.failed',
        { runId, reason: 'rejected' },
        { type: 'run.failed', title: 'Run rejected' },
      );
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

  /**
   * Execute the approved `open_pull_request` action: resolve the run's repo from
   * its task -> project, build a proposal document from the agent's latest model
   * response, and open a real GitHub pull request (branch -> commit -> PR).
   * Throws a user-facing error when the project has no repo linked or GitHub is
   * not connected; the caller turns that into a failed run. No token material is
   * read here — the client factory owns decryption.
   */
  private async executeOpenPullRequest(run: {
    id: string;
    taskId: string | null;
  }): Promise<Prisma.InputJsonObject> {
    // Resolve the target repository from the run's task -> project.
    let task:
      | { title: string; description: string | null; projectId: string }
      | null = null;
    let project: { repoOwner: string | null; repoName: string | null } | null =
      null;
    if (run.taskId) {
      task = await this.prisma.task.findFirst({
        where: { id: run.taskId, organizationId: currentOrgId() },
        select: { title: true, description: true, projectId: true },
      });
      if (task) {
        project = await this.prisma.project.findFirst({
          where: { id: task.projectId, organizationId: currentOrgId() },
          select: { repoOwner: true, repoName: true },
        });
      }
    }

    if (!project?.repoOwner || !project?.repoName) {
      throw new Error(
        'No GitHub repository is linked to this project. Set the repo owner and name on the project, then try again.',
      );
    }

    const client = await this.github.forCurrentOrg();
    if (!client) {
      throw new Error(
        'GitHub is not connected. Add a GitHub token in Settings to open pull requests.',
      );
    }

    const title = task?.title?.trim() || 'Agent Control Plane proposal';
    const branch = `acp/run-${run.id.slice(0, 8)}`;

    // Prefer the agent's structured file edits (the real change). Fall back to a
    // proposal document built from the model's text when it produced none.
    const changesEvent = await this.prisma.runEvent.findFirst({
      where: { runId: run.id, type: 'CHANGES_PROPOSED' },
      orderBy: { createdAt: 'desc' },
    });
    const proposedFiles = this.readProposedFiles(changesEvent?.payload);
    const summary = this.readProposedSummary(changesEvent?.payload);

    let files: OpenPrFile[];
    let proposalSection: string;
    if (proposedFiles.length > 0) {
      files = proposedFiles;
      proposalSection =
        summary ||
        `Edits ${proposedFiles.length} file(s): ${proposedFiles
          .map((f) => f.path)
          .join(', ')}.`;
    } else {
      // No structured edits — commit a proposal document from the model text.
      const modelEvent = await this.prisma.runEvent.findFirst({
        where: { runId: run.id, type: 'MODEL_RESPONSE' },
        orderBy: { createdAt: 'desc' },
      });
      const proposalText =
        modelEvent &&
        modelEvent.payload &&
        typeof modelEvent.payload === 'object'
          ? String((modelEvent.payload as { text?: unknown }).text ?? '')
          : '';
      proposalSection = proposalText || '_No proposal text was produced._';
      files = [
        {
          path: `acp/proposals/${run.id}.md`,
          content: `# ${title}\n\n${proposalSection}\n`,
        },
      ];
    }

    const body = [
      'Proposed by an Agent Control Plane agent and approved by a human reviewer.',
      '',
      '## Task',
      title,
      ...(task?.description ? ['', task.description] : []),
      '',
      '## Summary',
      proposalSection,
    ].join('\n');

    const input: OpenPrInput = {
      owner: project.repoOwner,
      repo: project.repoName,
      title,
      body,
      branch,
      files,
    };

    const pr = await client.openPullRequest(input);

    // Only JSON-safe, non-secret fields — never undefined (Prisma JSON rejects it).
    const result: Prisma.InputJsonObject = {
      opened: true,
      pullRequestUrl: pr.pullRequestUrl,
      branch: pr.branch,
      filesChanged: files.length,
      files: files.map((f) => f.path),
      ...(typeof pr.number === 'number' ? { number: pr.number } : {}),
    };
    return result;
  }

  /**
   * Read the proposed file edits (path + content) from a CHANGES_PROPOSED event
   * payload, defensively — anything malformed is ignored and yields an empty
   * list so the caller falls back to a proposal document.
   */
  private readProposedFiles(
    payload: Prisma.JsonValue | null | undefined,
  ): OpenPrFile[] {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return [];
    }
    const raw = (payload as { files?: unknown }).files;
    if (!Array.isArray(raw)) return [];
    const out: OpenPrFile[] = [];
    for (const entry of raw) {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof (entry as { path?: unknown }).path === 'string' &&
        typeof (entry as { content?: unknown }).content === 'string'
      ) {
        out.push({
          path: (entry as { path: string }).path,
          content: (entry as { content: string }).content,
        });
      }
    }
    return out;
  }

  /** Read the summary string from a CHANGES_PROPOSED event payload, or ''. */
  private readProposedSummary(
    payload: Prisma.JsonValue | null | undefined,
  ): string {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const s = (payload as { summary?: unknown }).summary;
      if (typeof s === 'string') return s;
    }
    return '';
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

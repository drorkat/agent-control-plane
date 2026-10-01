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
import { ChangeProposal } from './change-proposal';
import { buildAgentLoopSystemPrompt, runAgentLoop } from './agent-loop';
import { OPEN_PR_ACTION, gatedAction } from './gated-action';
import { PaginationQuery, paginationArgs } from '../common/pagination';
import {
  WebhookDispatcher,
  WebhookEvent,
} from '../webhooks/webhook-dispatcher.service';
import { NotificationsService } from '../notifications/notifications.service';

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

    // If the task's project is linked to a GitHub repo (and GitHub is connected),
    // the agent reads real code and works in multiple tool steps (list files,
    // read files) before proposing actual file edits, then requests approval to
    // open a pull request. Without an openable repo it makes a single
    // context-free planning call and completes with that plan — there is no PR to
    // gate, so it never asks for an approval it could not fulfil.
    const project = await this.prisma.project.findFirst({
      where: { id: task.projectId, organizationId: currentOrgId() },
      select: { repoOwner: true, repoName: true },
    });

    try {
      // The decrypted key lives only inside the provider instance returned here;
      // it is never surfaced back to this service.
      const provider = await this.factory.forAgent(agent);

      let modelText = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let proposal: ChangeProposal | null = null;
      let requestedAction: string | undefined;
      let beforeByPath = new Map<string, string>();

      const client =
        project?.repoOwner && project?.repoName
          ? await this.github.forCurrentOrg()
          : null;
      const context =
        client && project?.repoOwner && project?.repoName
          ? await this.repoContext.gather(
              project.repoOwner,
              project.repoName,
              taskText,
            )
          : null;

      if (client && context && project?.repoOwner && project?.repoName) {
        // Multi-step agent loop over the connected repository.
        await this.addEvent(run.id, 'CONTEXT_READ', {
          filesRead: context.files.length,
          totalFiles: context.allPaths.length,
        });
        const loop = await runAgentLoop({
          provider,
          client,
          owner: project.repoOwner,
          repo: project.repoName,
          model: agent.model,
          system: buildAgentLoopSystemPrompt(baseInstructions),
          taskText,
          contextSection: context.promptSection,
          allPaths: context.allPaths,
          seedFiles: new Map(context.files.map((f) => [f.path, f.content])),
          onEvent: async (type, payload) => {
            await this.addEvent(run.id, type, payload as Prisma.InputJsonObject);
          },
          // The gateway governs every repo read: an auto policy proceeds (and is
          // recorded as such), a blocked policy stops the read from ever running.
          gate: (a) => this.gateway.evaluate(a),
        });
        modelText = loop.finalText;
        inputTokens = loop.inputTokens;
        outputTokens = loop.outputTokens;
        proposal = loop.proposal;
        requestedAction = loop.requestedAction;
        beforeByPath = loop.readFiles;
      } else {
        // No repo: a single context-free planning call.
        const res = await provider.complete({
          system: baseInstructions,
          prompt: taskText,
          model: agent.model,
        });
        modelText = res.text;
        inputTokens = res.inputTokens;
        outputTokens = res.outputTokens;
      }

      await this.addEvent(run.id, 'MODEL_RESPONSE', { text: modelText });

      // Persist token usage / cost now. The outcome (complete / approval /
      // blocked) is decided by the gateway below — the tokens stay written
      // across all of those outcomes.
      const cost = computeCostUsd(agent.model, inputTokens, outputTokens);
      await this.prisma.run.update({
        where: { id: run.id },
        data: { inputTokens, outputTokens, costUsd: cost },
      });

      // Record the agent's structured edits, including the ORIGINAL content of
      // each touched file when the agent read it, so the run detail can show a
      // real before/after diff and the approved PR commits the real changes.
      if (proposal && proposal.files.length > 0) {
        const changes: Prisma.InputJsonObject = {
          summary: proposal.summary,
          fileCount: proposal.files.length,
          files: proposal.files.map((f) => {
            const previous = beforeByPath.get(f.path);
            return {
              path: f.path,
              content: f.content,
              ...(previous !== undefined ? { previousContent: previous } : {}),
            };
          }),
        };
        await this.addEvent(run.id, 'CHANGES_PROPOSED', changes);
      }

      // If the agent cannot actually open a pull request — no repo linked, or
      // GitHub not connected — there is no external action to gate. Requesting a
      // human approval here would be a dead end: approving it only fails later in
      // executeOpenPullRequest ("no repository linked"). Instead complete the run
      // now with the plan the agent produced.
      const canOpenPullRequest = !!(
        client &&
        project?.repoOwner &&
        project?.repoName
      );
      if (!canOpenPullRequest) {
        const reason =
          project?.repoOwner && project?.repoName
            ? 'GitHub is not connected, so no pull request was opened — the agent produced a plan only.'
            : 'No GitHub repository is linked to this project, so the agent produced a plan only.';
        await this.addEvent(run.id, 'RUN_COMPLETED', { planOnly: true, reason });
        await this.prisma.run.update({
          where: { id: run.id },
          data: { status: 'completed', completedAt: new Date() },
        });
        this.emit(
          'run.completed',
          { runId: run.id, task: task.title, status: 'completed', planOnly: true },
          {
            type: 'run.completed',
            title: 'Run completed (plan only)',
            body: task.title,
          },
        );
        await this.prisma.agent.update({
          where: { id: agent.id },
          data: { status: 'idle' },
        });
        return this.findOne(run.id);
      }

      // Route the run's ACTUAL action through the Tool Gateway. If the agent
      // explicitly requested a governed action (merge_pull_request,
      // delete_data, ...), that is what gets evaluated — reaching the blocked /
      // high-risk tiers. Otherwise it is derived from the proposal: file edits
      // map to open_pull_request (approval), a read-only run to read_repo (auto)
      // and completes without a human. Governance that reflects what the agent
      // did, not a blanket "everything needs approval".
      const action = gatedAction(requestedAction, proposal);
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
   * approval the parked `action` is executed — open_pull_request opens a real
   * PR, while any other governed action (merge_pull_request, deploy_production,
   * ...) is recorded as executed — and the run completes; on rejection the run
   * fails. Either way the agent returns to idle. `action` is the Approval row's
   * actionType (defaults to open_pull_request for older callers). Records the
   * decision as RunEvents plus an audit entry. Scoped to the default org.
   */
  async resume(
    runId: string,
    approved: boolean,
    resolvedByUserId?: string,
    action: string = OPEN_PR_ACTION,
  ) {
    const run = await this.prisma.run.findFirst({
      where: { id: runId, organizationId: currentOrgId() },
    });
    if (!run) {
      throw new NotFoundException(`Run "${runId}" not found`);
    }
    if (run.status !== 'waiting_approval') {
      throw new BadRequestException('Run is not awaiting approval');
    }

    // What was parked is decided by the Approval row's actionType, passed in by
    // the approvals service (defaulting to open_pull_request). Most parked runs
    // are an open_pull_request; a run that requested a governed action
    // (merge_pull_request, deploy_production, ...) parks THAT and must resume as
    // the same action — never silently open a PR instead.

    if (approved) {
      await this.addEvent(runId, 'APPROVAL_RECEIVED');
      if (action === OPEN_PR_ACTION) {
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
          // The GitHub client never puts token material in its error messages,
          // so this is safe to record and show.
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
        // A governed, non-PR action (merge_pull_request, deploy_production, ...)
        // approved by a human. The gateway's role was the human gate; record the
        // approved execution and complete the run. We deliberately do not
        // fabricate a GitHub side effect for an action the run only requested.
        await this.addEvent(runId, 'TOOL_EXECUTED', {
          action,
          result: { executed: true, note: 'approved by reviewer' },
        });
        await this.audit.record({
          actorType: 'user',
          actorId: resolvedByUserId,
          action: 'tool.executed',
          resourceType: 'run',
          resourceId: runId,
          metadata: { action },
        });
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

  /** A page of runs in the default org, newest first, with agent/task summaries. */
  findAll(query: PaginationQuery = {}) {
    return this.prisma.run.findMany({
      where: { organizationId: currentOrgId() },
      orderBy: { createdAt: 'desc' },
      ...paginationArgs(query),
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

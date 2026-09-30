import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_ORG_ID } from '../common/tenant';
import { RunsService } from '../runs/runs.service';
import { AuditService } from '../audit/audit.service';

/**
 * Human-in-the-loop approvals. When the Tool Gateway parks a run at
 * `waiting_approval`, an Approval row is created for a reviewer. Resolving it
 * here (approve/reject) records the decision, writes an audit entry, and hands
 * back to the run engine to either execute the action or fail the run.
 */
@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runsService: RunsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Approvals for the default org, newest first, optionally filtered by status.
   *
   * The Approval model has no Prisma `run` relation, so we join each approval's
   * run (with its agent/task summaries) in a second query and attach it as a
   * `run` field — producing the { ..., run: { id, status, agent, task } } shape
   * the UI relies on.
   */
  async findAll(status?: string) {
    const approvals = await this.prisma.approval.findMany({
      where: {
        organizationId: DEFAULT_ORG_ID,
        ...(status ? { status } : {}),
      },
      orderBy: { requestedAt: 'desc' },
    });

    const runIds = [
      ...new Set(
        approvals
          .map((a) => a.runId)
          .filter((id): id is string => id !== null),
      ),
    ];

    const runs = runIds.length
      ? await this.prisma.run.findMany({
          where: { id: { in: runIds }, organizationId: DEFAULT_ORG_ID },
          select: {
            id: true,
            status: true,
            agent: { select: { id: true, name: true } },
            task: { select: { id: true, title: true } },
          },
        })
      : [];

    const runById = new Map(runs.map((r) => [r.id, r]));

    return approvals.map((approval) => ({
      ...approval,
      run: approval.runId ? runById.get(approval.runId) ?? null : null,
    }));
  }

  /**
   * Approve a pending approval, then resume its run so the proposed action is
   * executed. The approval must be `pending` and linked to a run.
   */
  async approve(id: string, userId?: string) {
    const approval = await this.load(id);

    const updated = await this.prisma.approval.update({
      where: { id: approval.id },
      data: {
        status: 'approved',
        resolvedAt: new Date(),
        resolvedByUserId: userId ?? null,
      },
    });

    await this.audit.record({
      actorType: 'user',
      actorId: userId,
      action: 'approval.approved',
      resourceType: 'approval',
      resourceId: approval.id,
      metadata: { runId: approval.runId, actionType: approval.actionType },
    });

    await this.runsService.resume(approval.runId, true, userId);

    return updated;
  }

  /**
   * Reject a pending approval (optionally with a reason), then resume its run
   * so the run is failed. The approval must be `pending` and linked to a run.
   */
  async reject(id: string, reason?: string, userId?: string) {
    const approval = await this.load(id);

    const updated = await this.prisma.approval.update({
      where: { id: approval.id },
      data: {
        status: 'rejected',
        resolvedAt: new Date(),
        resolvedByUserId: userId ?? null,
        reason: reason ?? null,
      },
    });

    await this.audit.record({
      actorType: 'user',
      actorId: userId,
      action: 'approval.rejected',
      resourceType: 'approval',
      resourceId: approval.id,
      metadata: {
        runId: approval.runId,
        actionType: approval.actionType,
        ...(reason ? { reason } : {}),
      },
    });

    await this.runsService.resume(approval.runId, false, userId);

    return updated;
  }

  /**
   * Load a pending, run-linked approval scoped to the default org. Narrows
   * `runId` to a non-null string for the resume() call. Throws NotFound if the
   * approval is missing, or BadRequest if it is already resolved or has no run.
   */
  private async load(id: string): Promise<{
    id: string;
    runId: string;
    actionType: string;
  }> {
    const approval = await this.prisma.approval.findFirst({
      where: { id, organizationId: DEFAULT_ORG_ID },
    });
    if (!approval) {
      throw new NotFoundException(`Approval "${id}" not found`);
    }
    if (approval.status !== 'pending') {
      throw new BadRequestException('Approval is not pending');
    }
    if (!approval.runId) {
      throw new BadRequestException('Approval is not linked to a run');
    }
    return {
      id: approval.id,
      runId: approval.runId,
      actionType: approval.actionType,
    };
  }
}

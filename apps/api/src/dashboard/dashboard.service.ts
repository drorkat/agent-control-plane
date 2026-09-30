import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { currentOrgId } from '../common/tenant';

// A task is "open" unless it has reached one of these terminal states.
const CLOSED_TASK_STATUSES = ['completed', 'failed', 'cancelled'];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Live headline stats for the current organization: agent/open-task/approval
   * counts, month-to-date spend, and the most recent runs and pending approvals.
   * Every query is scoped to currentOrgId().
   */
  async stats() {
    const organizationId = currentOrgId();

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      agents,
      openTasks,
      pendingApprovals,
      costAggregate,
      recentRuns,
      pendingApprovalItems,
    ] = await Promise.all([
      this.prisma.agent.count({ where: { organizationId } }),
      this.prisma.task.count({
        where: {
          organizationId,
          status: { notIn: CLOSED_TASK_STATUSES },
        },
      }),
      this.prisma.approval.count({
        where: { organizationId, status: 'pending' },
      }),
      this.prisma.run.aggregate({
        where: { organizationId, createdAt: { gte: startOfMonth } },
        _sum: { costUsd: true },
      }),
      this.prisma.run.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          status: true,
          model: true,
          createdAt: true,
          agent: { select: { id: true, name: true } },
          task: { select: { id: true, title: true } },
        },
      }),
      this.prisma.approval.findMany({
        where: { organizationId, status: 'pending' },
        orderBy: { requestedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          actionType: true,
          riskLevel: true,
          requestedAt: true,
        },
      }),
    ]);

    return {
      agents,
      openTasks,
      pendingApprovals,
      // costUsd is a Prisma Decimal; expose a plain number for the UI.
      costThisMonth: costAggregate._sum.costUsd?.toNumber() ?? 0,
      recentRuns,
      pendingApprovalItems,
    };
  }
}

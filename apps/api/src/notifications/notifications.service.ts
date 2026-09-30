import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { currentOrgId, currentUserId } from '../common/tenant';

/**
 * Input to {@link NotificationsService.notify}. `organizationId` is optional so
 * callers running inside a request can rely on the tenant context, while callers
 * in a background/async context (where that context may be gone) can pass it.
 */
export interface NotifyInput {
  type: string;
  title: string;
  body?: string;
  userId?: string;
  organizationId?: string;
}

/**
 * In-app notifications shown in the topbar bell. Other services call
 * {@link notify} when something the operator should see happens (an approval was
 * requested, a run completed or failed, a pull request opened).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a notification. Best-effort: notifying is a side effect of some other
   * operation (finishing a run, requesting an approval), so a failure here must
   * never throw into — and roll back — that caller. Errors are logged and
   * swallowed. `organizationId` may be passed explicitly for async callers whose
   * tenant context is no longer available.
   */
  async notify(input: NotifyInput): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          organizationId: input.organizationId ?? currentOrgId(),
          userId: input.userId ?? null,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to create notification "${input.type}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Visibility scope: notifications for the current org that are either org-wide
   * (`userId` null) or addressed to the current user — so a user never sees a
   * notification targeted at someone else.
   */
  private visibleWhere() {
    return {
      organizationId: currentOrgId(),
      OR: [{ userId: null }, { userId: currentUserId() }],
    };
  }

  /** Notifications visible to the current user, newest first (capped for the bell). */
  findAll() {
    return this.prisma.notification.findMany({
      where: this.visibleWhere(),
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }

  /** Count of unread notifications visible to the current user. */
  async unreadCount(): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { ...this.visibleWhere(), read: false },
    });
    return { count };
  }

  /** Mark every unread notification visible to the current user as read. */
  async markAllRead(): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { ...this.visibleWhere(), read: false },
      data: { read: true },
    });
    return { updated: result.count };
  }

  /**
   * Mark a single notification read, scoped to the current org. The `findFirst`
   * acts as an ownership guard: another org's notification (or a bad id) yields
   * a 404 instead of a cross-tenant update.
   */
  async markRead(id: string) {
    const existing = await this.prisma.notification.findFirst({
      where: { id, organizationId: currentOrgId() },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Notification ${id} not found`);
    }
    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }
}

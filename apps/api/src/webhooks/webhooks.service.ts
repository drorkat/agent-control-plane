import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { currentOrgId } from '../common/tenant';
import { CreateWebhookDto } from './dto/create-webhook.dto';

/**
 * Safe, client-facing view of a webhook. It deliberately omits `secret`: the
 * signing key is returned exactly once, by {@link WebhooksService.create}, and
 * never again — mirroring how GitHub shows a webhook secret only at creation.
 */
export interface WebhookView {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  lastStatus: string | null;
  lastDeliveredAt: Date | null;
  createdAt: Date;
}

/**
 * The exact set of safe columns to load/return for a webhook. Because this is a
 * Prisma `select`, `secret` is never even read into memory in these queries,
 * which makes accidentally leaking it impossible.
 */
const SAFE_SELECT = {
  id: true,
  url: true,
  events: true,
  active: true,
  lastStatus: true,
  lastDeliveredAt: true,
  createdAt: true,
} as const;

@Injectable()
export class WebhooksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List webhooks for the current org, newest first. Only the safe columns are
   * selected, so the signing secret never leaves the database here.
   */
  findAll(): Promise<WebhookView[]> {
    return this.prisma.webhook.findMany({
      where: { organizationId: currentOrgId() },
      orderBy: { createdAt: 'desc' },
      select: SAFE_SELECT,
    });
  }

  /**
   * Create a webhook endpoint. A random signing secret is generated server-side
   * and returned **once** in this response so the operator can configure their
   * receiver to verify the `X-ACP-Signature` HMAC; it is never returned again.
   */
  async create(
    dto: CreateWebhookDto,
  ): Promise<WebhookView & { secret: string }> {
    const secret = randomBytes(24).toString('hex');

    const webhook = await this.prisma.webhook.create({
      data: {
        organizationId: currentOrgId(),
        url: dto.url,
        secret,
        events: dto.events,
        active: dto.active ?? true,
      },
      select: SAFE_SELECT,
    });

    // The one and only time the secret is ever exposed by the API.
    return { ...webhook, secret };
  }

  /**
   * Delete a webhook, scoped to the current org. The `findFirst` acts as an
   * ownership guard: a row belonging to another org (or a bad id) yields a 404
   * instead of a cross-tenant delete.
   */
  async remove(id: string): Promise<void> {
    const existing = await this.prisma.webhook.findFirst({
      where: { id, organizationId: currentOrgId() },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Webhook ${id} not found`);
    }
    await this.prisma.webhook.delete({ where: { id } });
  }

  /**
   * The most recent delivery attempts for a webhook (newest first) for the UI's
   * per-endpoint history. The webhook is verified to belong to the current org
   * first, so another tenant's delivery history can't be read.
   */
  async recentDeliveries(webhookId: string) {
    const existing = await this.prisma.webhook.findFirst({
      where: { id: webhookId, organizationId: currentOrgId() },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Webhook ${webhookId} not found`);
    }
    return this.prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }
}

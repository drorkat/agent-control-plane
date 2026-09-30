import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { currentOrgId } from '../common/tenant';
import { isBlockedHost } from './url-guard';

/**
 * The events an outbound webhook can subscribe to. Each corresponds to a
 * governance- or lifecycle-relevant moment other services emit: an approval was
 * requested, a run completed or failed, or an agent opened a pull request.
 */
export type WebhookEvent =
  | 'approval.requested'
  | 'run.completed'
  | 'run.failed'
  | 'pull_request.opened';

/** Every webhook event name — used by the create DTO's validation and the UI. */
export const WEBHOOK_EVENTS: WebhookEvent[] = [
  'approval.requested',
  'run.completed',
  'run.failed',
  'pull_request.opened',
];

/** How long (ms) to wait for a receiver before aborting the delivery. */
const DELIVERY_TIMEOUT_MS = 5000;

/**
 * Fires outbound webhooks. Other services (the run engine, approvals) call
 * {@link dispatch} when something happens; this fans the event out to every
 * active endpoint in the org that subscribes to it, signs each payload with that
 * endpoint's secret (HMAC-SHA256 over the body), and records the outcome as a
 * WebhookDelivery.
 *
 * Delivery is fire-and-forget by design: {@link dispatch} returns immediately
 * and can never throw into its caller, so a slow or broken receiver never stalls
 * or fails the run/approval that emitted the event.
 */
@Injectable()
export class WebhookDispatcher {
  private readonly logger = new Logger(WebhookDispatcher.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Emit an event to every active webhook in the current org subscribed to it.
   *
   * The org id is captured *synchronously* here on purpose: the
   * AsyncLocalStorage tenant context that backs currentOrgId() only lives for
   * the duration of the calling request, and the delivery work below runs after
   * this method has already returned — by which point that context may be gone.
   *
   * We kick off that work without awaiting it (fire-and-forget) and swallow any
   * error, so the caller is never blocked and never sees a throw.
   */
  dispatch(event: WebhookEvent, data: Record<string, unknown>): void {
    const organizationId = currentOrgId();
    try {
      void this.deliverAll(organizationId, event, data).catch((err) => {
        // Per-delivery failures are handled and recorded inside deliverAll;
        // this only fires for an unexpected error (e.g. the DB is unreachable).
        this.logger.error(
          `Webhook dispatch for "${event}" failed: ${errorMessage(err)}`,
        );
      });
    } catch (err) {
      // Belt-and-suspenders: guard even a synchronous throw while starting the
      // background work, so emitting an event can never break its caller.
      this.logger.error(
        `Webhook dispatch for "${event}" failed: ${errorMessage(err)}`,
      );
    }
  }

  /**
   * Load every active, subscribed webhook for the org and attempt delivery to
   * each. Deliveries are independent: one endpoint failing never affects the
   * others, and nothing here rejects into the caller.
   */
  private async deliverAll(
    organizationId: string,
    event: WebhookEvent,
    data: Record<string, unknown>,
  ): Promise<void> {
    const webhooks = await this.prisma.webhook.findMany({
      where: { organizationId, active: true, events: { has: event } },
    });
    if (webhooks.length === 0) return;

    // One logical emission => one payload/timestamp, signed per endpoint below.
    const body = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      data,
    });

    await Promise.all(
      webhooks.map((webhook) => this.deliverOne(webhook, event, body)),
    );
  }

  /**
   * Deliver one signed payload to one endpoint and record the result. Network
   * errors, timeouts, and non-2xx responses all become a failed WebhookDelivery.
   * The signing secret is never included in any stored error or log line.
   */
  private async deliverOne(
    webhook: { id: string; url: string; secret: string },
    event: WebhookEvent,
    body: string,
  ): Promise<void> {
    // Re-check the target at delivery time (not just at creation): a host can be
    // pointed at an internal address after the webhook was created — DNS
    // rebinding, or a later edit — so we re-resolve and classify right before the
    // fetch. The WEBHOOK_ALLOW_PRIVATE escape hatch (local dev) skips this, in
    // step with assertSafeWebhookUrl at creation. When blocked we never fetch
    // (and never sign, so the secret is never touched); the attempt is recorded
    // as failed with the reason.
    if (process.env.WEBHOOK_ALLOW_PRIVATE !== '1') {
      const reason = await isBlockedHost(new URL(webhook.url).hostname);
      if (reason) {
        await this.recordDelivery(
          webhook.id,
          event,
          'failed',
          null,
          `Blocked (SSRF guard): ${reason}`,
        );
        return;
      }
    }

    const signature =
      'sha256=' +
      createHmac('sha256', webhook.secret).update(body).digest('hex');

    let status = 'failed';
    let statusCode: number | null = null;
    let error: string | null = null;

    try {
      const res = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ACP-Event': event,
          'X-ACP-Signature': signature,
          'User-Agent': 'agent-control-plane',
        },
        body,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });
      statusCode = res.status;
      status = res.ok ? 'success' : 'failed';
      if (!res.ok) {
        error = `Endpoint responded with status ${res.status}`;
      }
    } catch (err) {
      // Network error, DNS failure, or the timeout aborting the request. The
      // message may mention the (non-secret) URL but never the secret.
      status = 'failed';
      error = errorMessage(err);
    }

    await this.recordDelivery(webhook.id, event, status, statusCode, error);
  }

  /**
   * Persist the delivery attempt and update the webhook's last-delivery summary
   * (the status pill in the UI). Best-effort: the delivery row is written first
   * so the attempt is kept even if the summary update fails, and any error is
   * logged rather than propagated.
   */
  private async recordDelivery(
    webhookId: string,
    event: WebhookEvent,
    status: string,
    statusCode: number | null,
    error: string | null,
  ): Promise<void> {
    try {
      await this.prisma.webhookDelivery.create({
        data: { webhookId, event, status, statusCode, error },
      });
      await this.prisma.webhook.update({
        where: { id: webhookId },
        data: { lastStatus: status, lastDeliveredAt: new Date() },
      });
    } catch (err) {
      this.logger.error(
        `Failed to record webhook delivery for ${webhookId}: ${errorMessage(err)}`,
      );
    }
  }
}

/** Extract a safe, string error message. Never exposes secret material. */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

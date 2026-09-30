// Typed client for the webhooks endpoints. Mirrors the provider-key and GitHub
// helpers: same-origin `/api/*` calls, reusing the shared request/error
// handling from the `api` client.
import { api } from './api';

/** The webhook event names the API can deliver, in display order. */
export const WEBHOOK_EVENTS = [
  'approval.requested',
  'run.completed',
  'run.failed',
  'pull_request.opened',
] as const;

/** One of the deliverable webhook event names. */
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/**
 * Safe, client-facing shape of a stored webhook. The signing secret is
 * write-only — the API returns it only once, at creation (see `CreatedWebhook`).
 */
export interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  lastStatus: string | null;
  lastDeliveredAt: string | null;
  createdAt: string;
}

/** A webhook plus its one-time signing secret, returned only by `createWebhook`. */
export interface CreatedWebhook extends Webhook {
  secret: string;
}

/** A recent delivery attempt for a webhook (the API returns the latest ~20). */
export interface WebhookDelivery {
  id: string;
  event: string;
  status: 'success' | 'failed';
  statusCode: number | null;
  error: string | null;
  createdAt: string;
}

/** Fields accepted when creating a webhook. */
export interface CreateWebhookInput {
  url: string;
  events: string[];
  active?: boolean;
}

/** All configured webhooks (the response never includes secrets). */
export function listWebhooks(): Promise<Webhook[]> {
  return api.get<Webhook[]>('/webhooks');
}

/** Create a webhook; the response includes the one-time signing `secret`. */
export function createWebhook(input: CreateWebhookInput): Promise<CreatedWebhook> {
  return api.post<CreatedWebhook>('/webhooks', input);
}

/** Delete a webhook. */
export function deleteWebhook(id: string): Promise<void> {
  return api.delete<void>(`/webhooks/${id}`);
}

/** Recent delivery attempts for a webhook (latest ~20, newest first). */
export function listWebhookDeliveries(id: string): Promise<WebhookDelivery[]> {
  return api.get<WebhookDelivery[]>(`/webhooks/${id}/deliveries`);
}

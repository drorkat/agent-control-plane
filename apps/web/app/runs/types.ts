import type { BadgeVariant } from '@/components/ui/badge';
import type { TranslateFn, TranslationKey } from '@/lib/i18n/dictionary';

export type RunStatus = 'running' | 'completed' | 'failed';

/** Minimal agent reference embedded in a run. */
export interface RunAgentRef {
  id: string;
  name: string;
}

/** Minimal task reference embedded in a run. */
export interface RunTaskRef {
  id: string;
  title: string;
}

/** Shape returned by the API for a run (dates arrive as ISO strings). */
export interface Run {
  id: string;
  taskId: string;
  agentId: string;
  provider: string;
  model: string;
  status: RunStatus | string;
  inputTokens: number;
  outputTokens: number;
  /** Serialized as a number, but a Decimal column may arrive as a string. */
  costUsd: number | string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  agent: RunAgentRef | null;
  task: RunTaskRef | null;
}

/** A single event recorded during a run. */
export type RunEventType =
  | 'RUN_CREATED'
  | 'MODEL_STARTED'
  | 'MODEL_RESPONSE'
  | 'APPROVAL_REQUESTED'
  | 'APPROVAL_RECEIVED'
  | 'APPROVAL_REJECTED'
  | 'TOOL_BLOCKED'
  | 'TOOL_EXECUTED'
  | 'RUN_COMPLETED'
  | 'RUN_FAILED';

export interface RunEvent {
  id: string;
  type: RunEventType | string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

/** A run plus its ordered event log, as returned by `GET /runs/:id`. */
export interface RunDetail extends Run {
  events: RunEvent[];
}

/** Map a run status to a design-system Badge variant. */
export function runStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'completed':
      return 'success';
    case 'failed':
      return 'danger';
    case 'running':
    default:
      return 'primary';
  }
}

const STATUS_LABEL_KEYS: Record<RunStatus, TranslationKey> = {
  running: 'runs.status.running',
  completed: 'runs.status.completed',
  failed: 'runs.status.failed',
};

/** Translated status name, falling back to the raw value for unknown statuses. */
export function runStatusLabel(status: string, t: TranslateFn): string {
  const key = STATUS_LABEL_KEYS[status as RunStatus];
  return key ? t(key) : status;
}

const EVENT_LABEL_KEYS: Record<RunEventType, TranslationKey> = {
  RUN_CREATED: 'runs.event.RUN_CREATED',
  MODEL_STARTED: 'runs.event.MODEL_STARTED',
  MODEL_RESPONSE: 'runs.event.MODEL_RESPONSE',
  APPROVAL_REQUESTED: 'runs.event.APPROVAL_REQUESTED',
  APPROVAL_RECEIVED: 'runs.event.APPROVAL_RECEIVED',
  APPROVAL_REJECTED: 'runs.event.APPROVAL_REJECTED',
  TOOL_BLOCKED: 'runs.event.TOOL_BLOCKED',
  TOOL_EXECUTED: 'runs.event.TOOL_EXECUTED',
  RUN_COMPLETED: 'runs.event.RUN_COMPLETED',
  RUN_FAILED: 'runs.event.RUN_FAILED',
};

/** Translated event-type label, falling back to the raw type for unknown ones. */
export function runEventLabel(type: string, t: TranslateFn): string {
  const key = EVENT_LABEL_KEYS[type as RunEventType];
  return key ? t(key) : type;
}

/** Map an event type to the color of its timeline marker. */
export function runEventTone(type: string): 'neutral' | 'primary' | 'success' | 'danger' {
  switch (type) {
    case 'RUN_COMPLETED':
      return 'success';
    case 'RUN_FAILED':
    case 'APPROVAL_REJECTED':
    case 'TOOL_BLOCKED':
      return 'danger';
    case 'MODEL_STARTED':
    case 'MODEL_RESPONSE':
    case 'APPROVAL_RECEIVED':
    case 'TOOL_EXECUTED':
      return 'primary';
    case 'RUN_CREATED':
    case 'APPROVAL_REQUESTED':
    default:
      return 'neutral';
  }
}

/**
 * The pull-request URL surfaced by an `open_pull_request` tool execution, read
 * defensively from `payload.result.pullRequestUrl`. Returns null when absent.
 */
export function pullRequestUrlFromEvent(event: RunEvent): string | null {
  const result = event.payload?.result;
  if (result && typeof result === 'object') {
    const url = (result as Record<string, unknown>).pullRequestUrl;
    if (typeof url === 'string' && url.trim()) return url;
  }
  return null;
}

/** `provider · model`, shown verbatim (never translated). */
export function providerModel(run: Pick<Run, 'provider' | 'model'>): string {
  return `${run.provider} · ${run.model}`;
}

/** Locale-aware integer formatting (thousands separators). */
export function formatNumber(value: number, lang: string): string {
  try {
    return new Intl.NumberFormat(lang).format(value);
  } catch {
    return String(value);
  }
}

/** USD cost with a `$` prefix; widens precision for sub-cent amounts. */
export function formatCost(costUsd: number | string, lang: string): string {
  const n = Number(costUsd ?? 0);
  if (!Number.isFinite(n)) return '$0.00';
  const digits = n !== 0 && Math.abs(n) < 0.01 ? 4 : 2;
  try {
    const num = new Intl.NumberFormat(lang, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n);
    return `$${num}`;
  } catch {
    return `$${n.toFixed(digits)}`;
  }
}

/** Duration in ms between start and completion, or null when it can't be computed. */
export function runDurationMs(run: Pick<Run, 'startedAt' | 'completedAt'>): number | null {
  if (!run.startedAt || !run.completedAt) return null;
  const start = new Date(run.startedAt).getTime();
  const end = new Date(run.completedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  const ms = end - start;
  return ms >= 0 ? ms : null;
}

/** Compact, translated duration ("12s", "3m 4s", "1h 2m"). */
export function formatDuration(ms: number, t: TranslateFn): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  if (totalSec < 60) return t('runs.duration.seconds', { value: totalSec });
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes < 60) return t('runs.duration.minutesSeconds', { minutes, seconds });
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return t('runs.duration.hoursMinutes', { hours, minutes: remMinutes });
}

/** Absolute date + time, localized to the active language. */
export function formatDateTime(iso: string, lang: string): string {
  try {
    return new Date(iso).toLocaleString(lang, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

/** Localized relative time ("5 minutes ago"), coarsened by magnitude. */
export function formatRelativeTime(iso: string, lang: string): string {
  try {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return iso;
    const diffSec = Math.round((then - Date.now()) / 1000);
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    const abs = Math.abs(diffSec);
    if (abs < 45) return rtf.format(diffSec, 'second');
    const diffMin = Math.round(diffSec / 60);
    if (Math.abs(diffMin) < 45) return rtf.format(diffMin, 'minute');
    const diffHour = Math.round(diffMin / 60);
    if (Math.abs(diffHour) < 24) return rtf.format(diffHour, 'hour');
    const diffDay = Math.round(diffHour / 24);
    if (Math.abs(diffDay) < 30) return rtf.format(diffDay, 'day');
    const diffMonth = Math.round(diffDay / 30);
    if (Math.abs(diffMonth) < 12) return rtf.format(diffMonth, 'month');
    return rtf.format(Math.round(diffMonth / 12), 'year');
  } catch {
    return iso;
  }
}

/** All MODEL_RESPONSE texts, joined — the model's output for the run. */
export function collectModelOutput(events: RunEvent[]): string {
  return events
    .filter((e) => e.type === 'MODEL_RESPONSE')
    .map((e) => {
      const text = e.payload?.text;
      return typeof text === 'string' ? text : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

/** The failure message from a RUN_FAILED event, if any. */
export function collectFailureMessage(events: RunEvent[]): string | null {
  for (const e of events) {
    if (e.type === 'RUN_FAILED') {
      const message = e.payload?.message;
      if (typeof message === 'string' && message.trim()) return message;
    }
  }
  return null;
}

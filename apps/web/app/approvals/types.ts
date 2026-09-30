import type { BadgeVariant } from '@/components/ui/badge';
import type { TranslateFn, TranslationKey } from '@/lib/i18n/dictionary';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Minimal run reference embedded in an approval. */
export interface ApprovalRunRef {
  id: string;
  status: string;
  agent: { id: string; name: string } | null;
  task: { id: string; title: string } | null;
}

/** Shape returned by the API for an approval (dates arrive as ISO strings). */
export interface Approval {
  id: string;
  actionType: string;
  riskLevel: RiskLevel | string;
  status: ApprovalStatus | string;
  requestedAt: string;
  resolvedAt: string | null;
  runId: string;
  run: ApprovalRunRef | null;
  /** Populated on a rejected approval when a reason was supplied. */
  reason?: string | null;
}

// ── risk ────────────────────────────────────────────────────────────────────

// low = neutral, medium = warning, high = danger, critical = danger.
const RISK_VARIANT: Record<RiskLevel, BadgeVariant> = {
  low: 'neutral',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};

/** Map a risk level to a design-system Badge variant. */
export function riskVariant(level: string): BadgeVariant {
  return RISK_VARIANT[level as RiskLevel] ?? 'neutral';
}

const RISK_LABEL_KEYS: Record<RiskLevel, TranslationKey> = {
  low: 'approvals.risk.low',
  medium: 'approvals.risk.medium',
  high: 'approvals.risk.high',
  critical: 'approvals.risk.critical',
};

/** Translated risk label, falling back to the raw value. */
export function riskLabel(level: string, t: TranslateFn): string {
  const key = RISK_LABEL_KEYS[level as RiskLevel];
  return key ? t(key) : level;
}

// ── status ──────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<ApprovalStatus, BadgeVariant> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

/** Map an approval status to a design-system Badge variant. */
export function statusVariant(status: string): BadgeVariant {
  return STATUS_VARIANT[status as ApprovalStatus] ?? 'neutral';
}

const STATUS_LABEL_KEYS: Record<ApprovalStatus, TranslationKey> = {
  pending: 'approvals.status.pending',
  approved: 'approvals.status.approved',
  rejected: 'approvals.status.rejected',
};

/** Translated status label, falling back to the raw value. */
export function statusLabel(status: string, t: TranslateFn): string {
  const key = STATUS_LABEL_KEYS[status as ApprovalStatus];
  return key ? t(key) : status;
}

// ── action type ───────────────────────────────────────────────────────────

const ACTION_LABEL_KEYS: Record<string, TranslationKey> = {
  read_repo: 'approvals.action.read_repo',
  create_branch: 'approvals.action.create_branch',
  commit: 'approvals.action.commit',
  open_pull_request: 'approvals.action.open_pull_request',
  merge_pull_request: 'approvals.action.merge_pull_request',
  deploy_production: 'approvals.action.deploy_production',
  delete_data: 'approvals.action.delete_data',
};

/**
 * Translated action label (e.g. `open_pull_request` → "Open pull request").
 * Unknown action types fall back to a humanized form of the raw value.
 */
export function actionLabel(actionType: string, t: TranslateFn): string {
  const key = ACTION_LABEL_KEYS[actionType];
  if (key) return t(key);
  const humanized = actionType
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return humanized || actionType;
}

// ── time formatting (locale-aware) ──────────────────────────────────────────

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

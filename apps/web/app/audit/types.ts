import type { TranslateFn, TranslationKey } from '@/lib/i18n/dictionary';

/** Shape returned by the API for an audit-log entry (newest first). */
export interface AuditEntry {
  id: string;
  actorType: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const ACTOR_LABEL_KEYS: Record<string, TranslationKey> = {
  user: 'audit.actor.user',
  agent: 'audit.actor.agent',
  system: 'audit.actor.system',
};

/** Translated actor-type label, falling back to the raw value. */
export function actorLabel(actorType: string, t: TranslateFn): string {
  const key = ACTOR_LABEL_KEYS[actorType?.toLowerCase()];
  return key ? t(key) : actorType;
}

/** True when there is metadata worth surfacing in a details panel. */
export function hasMetadata(metadata: Record<string, unknown> | null): boolean {
  return !!metadata && Object.keys(metadata).length > 0;
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

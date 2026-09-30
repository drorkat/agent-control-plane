'use client';

import * as React from 'react';
import {
  Bot,
  ChevronDown,
  Cpu,
  RefreshCw,
  ScrollText,
  Server,
  TriangleAlert,
  User,
  type LucideIcon,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n/context';
import type { TranslateFn } from '@/lib/i18n/dictionary';
import { cn } from '@/lib/utils';
import {
  AuditEntry,
  actorLabel,
  formatDateTime,
  formatRelativeTime,
  hasMetadata,
} from './types';

// One grid template shared by the header and every row so the columns line up.
// Below `md` each row falls back to a stacked card (and the header hides).
const ROW_GRID =
  'md:grid md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1.4fr)] md:items-center md:gap-4';

/** Icon per actor type; an unknown/other actor gets a neutral chip. */
const ACTOR_ICON: Record<string, LucideIcon> = {
  user: User,
  agent: Bot,
  system: Server,
};

function actorIcon(actorType: string): LucideIcon {
  return ACTOR_ICON[actorType?.toLowerCase()] ?? Cpu;
}

export default function AuditPage() {
  const { t, lang } = useI18n();
  const [entries, setEntries] = React.useState<AuditEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const data = await api.get<AuditEntry[]>('/audit');
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('audit.loadError'));
    }
  }, [t]);

  React.useEffect(() => {
    void (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const hasEntries = entries.length > 0;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {t('audit.title')}
              </h1>
              {!loading && !error && hasEntries && (
                <Badge variant="neutral">{entries.length}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{t('audit.subtitle')}</p>
          </div>
          {!loading && !error && hasEntries && (
            <Button variant="secondary" size="md" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={cn(refreshing && 'animate-spin')} />
              {t('audit.refresh')}
            </Button>
          )}
        </div>

        {/* Content states */}
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={handleRefresh} t={t} />
        ) : !hasEntries ? (
          <EmptyState t={t} />
        ) : (
          <Card className="overflow-hidden">
            {/* Column headers (desktop only) */}
            <div
              className={cn(
                ROW_GRID,
                'hidden border-b border-border bg-muted/30 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70',
              )}
            >
              <span>{t('audit.column.time')}</span>
              <span>{t('audit.column.actor')}</span>
              <span>{t('audit.column.action')}</span>
              <span>{t('audit.column.resource')}</span>
            </div>

            <div className="divide-y divide-border">
              {entries.map((entry) => (
                <AuditRow key={entry.id} entry={entry} t={t} lang={lang} />
              ))}
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function AuditRow({
  entry,
  t,
  lang,
}: {
  entry: AuditEntry;
  t: TranslateFn;
  lang: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ActorIcon = actorIcon(entry.actorType);
  const expandable = hasMetadata(entry.metadata);
  const hasResource = Boolean(entry.resourceType || entry.resourceId);

  return (
    <div className="px-4 py-3.5">
      <div className={cn(ROW_GRID, 'flex flex-col gap-3')}>
        {/* Time */}
        <Cell label={t('audit.column.time')}>
          <span
            className="text-xs text-muted-foreground"
            title={formatDateTime(entry.createdAt, lang)}
          >
            {formatRelativeTime(entry.createdAt, lang)}
          </span>
        </Cell>

        {/* Actor */}
        <Cell label={t('audit.column.actor')}>
          <span className="flex min-w-0 items-center gap-2">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              <ActorIcon className="size-3.5" />
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-sm font-medium text-foreground">
                {actorLabel(entry.actorType, t)}
              </span>
              {entry.actorId && (
                <span className="truncate font-mono text-[11px] text-muted-foreground">
                  {entry.actorId}
                </span>
              )}
            </span>
          </span>
        </Cell>

        {/* Action */}
        <Cell label={t('audit.column.action')}>
          <code className="inline-block max-w-full truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            {entry.action}
          </code>
        </Cell>

        {/* Resource */}
        <Cell label={t('audit.column.resource')}>
          {hasResource ? (
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              {entry.resourceType && (
                <span className="text-sm font-medium text-foreground">{entry.resourceType}</span>
              )}
              {entry.resourceId && (
                <span className="truncate font-mono text-[11px] text-muted-foreground">
                  {entry.resourceId}
                </span>
              )}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{t('audit.noResource')}</span>
          )}
        </Cell>
      </div>

      {/* Details toggle */}
      {expandable && (
        <div className="mt-2.5 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
            {open ? t('audit.hideDetails') : t('audit.details')}
          </Button>
        </div>
      )}

      {/* Metadata panel */}
      {expandable && open && (
        <div className="mt-3 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {t('audit.metadata')}
          </p>
          <pre
            dir="ltr"
            className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-start font-mono text-xs leading-relaxed text-foreground"
          >
            {JSON.stringify(entry.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * A single cell: on the stacked card it shows an inline uppercase label above
 * its value; at `md` the label is hidden and the value sits in its grid column.
 */
function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 md:hidden">
        {label}
      </span>
      {children}
    </div>
  );
}

function EmptyState({ t }: { t: TranslateFn }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-card text-muted-foreground shadow-xs ring-1 ring-border">
        <ScrollText className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{t('audit.emptyTitle')}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{t('audit.emptyDesc')}</p>
      </div>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
  t,
}: {
  message: string;
  onRetry: () => void;
  t: TranslateFn;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-danger/30 bg-danger/5 px-6 py-16 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-card text-danger shadow-xs ring-1 ring-danger/25">
        <TriangleAlert className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{t('audit.loadErrorTitle')}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{message}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        <RefreshCw />
        {t('common.tryAgain')}
      </Button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="divide-y divide-border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <div className="h-3.5 w-20 animate-pulse rounded bg-muted" />
            <div className="flex flex-1 items-center gap-2">
              <div className="size-6 shrink-0 animate-pulse rounded-md bg-muted" />
              <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
            </div>
            <div className="hidden h-5 w-32 animate-pulse rounded bg-muted sm:block" />
            <div className="hidden h-3.5 w-28 animate-pulse rounded bg-muted sm:block" />
          </div>
        ))}
      </div>
    </Card>
  );
}

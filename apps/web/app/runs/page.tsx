'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Activity,
  Bot,
  Coins,
  DollarSign,
  ListTodo,
  RefreshCw,
  Timer,
  TriangleAlert,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n/context';
import type { Lang } from '@/lib/i18n/context';
import type { TranslateFn } from '@/lib/i18n/dictionary';
import { cn } from '@/lib/utils';
import {
  Run,
  formatCost,
  formatDuration,
  formatNumber,
  formatDateTime,
  formatRelativeTime,
  providerModel,
  runDurationMs,
  runStatusLabel,
  runStatusVariant,
} from './types';

// One grid template shared by the header and every row so their columns line up.
// Below `xl` the row falls back to a stacked card (see RunRow) and the header hides.
const ROW_GRID =
  'xl:grid xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1.5fr)_auto_auto_auto_auto_auto] xl:items-center xl:gap-4';

export default function RunsPage() {
  const { t, lang } = useI18n();
  const [runs, setRuns] = React.useState<Run[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const data = await api.get<Run[]>('/runs');
      setRuns(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('runs.loadError'));
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

  const hasRuns = runs.length > 0;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {t('runs.title')}
              </h1>
              {!loading && !error && hasRuns && <Badge variant="neutral">{runs.length}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{t('runs.subtitle')}</p>
          </div>
          {!loading && !error && hasRuns && (
            <Button
              variant="secondary"
              size="md"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={cn(refreshing && 'animate-spin')} />
              {t('runs.refresh')}
            </Button>
          )}
        </div>

        {/* Content states */}
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={handleRefresh} t={t} />
        ) : !hasRuns ? (
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
              <span>{t('runs.field.agent')}</span>
              <span>{t('runs.field.model')}</span>
              <span>{t('common.status')}</span>
              <span className="text-end">{t('runs.field.tokens')}</span>
              <span className="text-end">{t('runs.field.cost')}</span>
              <span className="text-end">{t('runs.field.duration')}</span>
              <span className="text-end">{t('runs.field.started')}</span>
            </div>

            <div className="divide-y divide-border">
              {runs.map((run) => (
                <RunRow key={run.id} run={run} t={t} lang={lang} />
              ))}
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function RunRow({ run, t, lang }: { run: Run; t: TranslateFn; lang: Lang }) {
  const durationMs = runDurationMs(run);
  const durationText = durationMs === null ? '—' : formatDuration(durationMs, t);
  const timeIso = run.startedAt ?? run.createdAt;
  const tokensSummary = t('runs.tokensSummary', {
    input: formatNumber(run.inputTokens, lang),
    output: formatNumber(run.outputTokens, lang),
  });

  return (
    <Link
      href={`/runs/${run.id}`}
      className={cn(
        ROW_GRID,
        'group relative flex flex-col gap-2.5 px-4 py-4 transition-colors',
        'hover:bg-accent/40 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring xl:py-3',
      )}
    >
      {/* Identity: agent (primary) + task (secondary) */}
      <div className="flex min-w-0 flex-col gap-0.5 pe-24 xl:pe-0">
        <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
          <Bot className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{run.agent?.name ?? t('runs.unknownAgent')}</span>
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {run.task?.title ?? t('runs.unknownTask')}
        </span>
      </div>

      {/* Meta cells: a wrapping chip row below xl, individual grid cells at xl. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm xl:contents">
        <span
          className="min-w-0 truncate font-mono text-xs text-muted-foreground"
          title={providerModel(run)}
        >
          {providerModel(run)}
        </span>

        {/* Status: floats to the top-inline-end on the stacked card, a column at xl. */}
        <span className="absolute end-4 top-4 xl:static xl:top-auto xl:end-auto">
          <Badge variant={runStatusVariant(run.status)} dot>
            {runStatusLabel(run.status, t)}
          </Badge>
        </span>

        <MetaCell icon={<Coins className="size-3.5" />} label={t('runs.field.tokens')}>
          <span className="tabular-nums" title={tokensSummary}>
            <span className="text-foreground">{formatNumber(run.inputTokens, lang)}</span>
            <span className="mx-0.5 text-muted-foreground/60">/</span>
            <span className="text-muted-foreground">{formatNumber(run.outputTokens, lang)}</span>
          </span>
        </MetaCell>

        <MetaCell icon={<DollarSign className="size-3.5" />} label={t('runs.field.cost')}>
          <span className="tabular-nums text-foreground">{formatCost(run.costUsd, lang)}</span>
        </MetaCell>

        <MetaCell icon={<Timer className="size-3.5" />} label={t('runs.field.duration')}>
          <span
            className={cn('tabular-nums', durationMs === null ? 'text-muted-foreground' : 'text-foreground')}
          >
            {durationText}
          </span>
        </MetaCell>

        <span
          className="text-xs text-muted-foreground xl:text-end"
          title={formatDateTime(timeIso, lang)}
        >
          {formatRelativeTime(timeIso, lang)}
        </span>
      </div>
    </Link>
  );
}

/**
 * A single stat: on the stacked card it reads "icon label value" as a chip; at
 * `xl` the label/icon are hidden and the value right-aligns into its column.
 */
function MetaCell({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5 xl:justify-end">
      <span className="flex items-center gap-1 text-muted-foreground xl:hidden">
        {icon}
        {label}
      </span>
      {children}
    </span>
  );
}

function ListSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 px-4 py-4">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
              <div className="h-3 w-56 max-w-full animate-pulse rounded bg-muted" />
            </div>
            <div className="hidden gap-6 sm:flex">
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
              <div className="h-4 w-12 animate-pulse rounded bg-muted" />
              <div className="h-4 w-14 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-5 w-20 shrink-0 animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </Card>
  );
}

function EmptyState({ t }: { t: TranslateFn }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-card text-muted-foreground shadow-xs ring-1 ring-border">
        <Activity className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{t('runs.emptyTitle')}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{t('runs.emptyDesc')}</p>
      </div>
      {/* Styled as a secondary/sm Button (which is a <button>, so we can't nest a link in it). */}
      <Link
        href="/tasks"
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] font-medium text-secondary-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:size-4 [&_svg]:shrink-0"
      >
        <ListTodo />
        {t('runs.emptyAction')}
      </Link>
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
        <p className="text-sm font-semibold text-foreground">{t('runs.loadErrorTitle')}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{message}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        <RefreshCw />
        {t('common.tryAgain')}
      </Button>
    </div>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  Ban,
  Bot,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  ChevronRight,
  Cpu,
  DollarSign,
  ExternalLink,
  GitPullRequest,
  Hash,
  ListTodo,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Terminal,
  Timer,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { ProposedChanges } from '@/components/runs/proposed-changes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n/context';
import type { Lang } from '@/lib/i18n/context';
import type { TranslateFn } from '@/lib/i18n/dictionary';
import { cn } from '@/lib/utils';
import {
  RunDetail,
  RunEvent,
  collectFailureMessage,
  collectModelOutput,
  contextReadFromEvent,
  toolDetailFromEvent,
  formatCost,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatRelativeTime,
  proposedChangesFromEvents,
  providerModel,
  pullRequestUrlFromEvent,
  runDurationMs,
  runEventLabel,
  runEventTone,
  runStatusLabel,
  runStatusVariant,
} from '../types';

const DOT_TONE: Record<string, string> = {
  neutral: 'bg-muted-foreground/50',
  primary: 'bg-primary',
  success: 'bg-success',
  danger: 'bg-danger',
};

export default function RunDetailPage() {
  const { t, lang } = useI18n();
  const params = useParams<{ id: string | string[] }>();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  const [run, setRun] = React.useState<RunDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(
    async (silent = false) => {
      if (!id) return;
      if (!silent) setError(null);
      try {
        const data = await api.get<RunDetail>(`/runs/${id}`);
        setRun(data);
      } catch (err) {
        // A background poll must not replace good data with an error screen.
        if (!silent) setError(err instanceof Error ? err.message : t('runs.loadError'));
      }
    },
    [id, t],
  );

  React.useEffect(() => {
    void (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  // While a run is still executing, quietly refresh so events/output stream in.
  React.useEffect(() => {
    if (run?.status !== 'running') return;
    const interval = setInterval(() => void load(true), 4000);
    return () => clearInterval(interval);
  }, [run?.status, load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <Link
          href="/runs"
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeft className="size-4 rtl:-scale-x-100" />
          {t('runs.detail.back')}
        </Link>

        {loading ? (
          <DetailSkeleton />
        ) : error || !run ? (
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <span className="grid size-11 place-items-center rounded-full bg-danger/10 text-danger ring-1 ring-inset ring-danger/25">
                  <TriangleAlert className="size-5" />
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {t('runs.detail.loadErrorTitle')}
                  </p>
                  <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                    {error ?? t('runs.detail.notFound')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => void load()}>
                    <RefreshCw />
                    {t('common.tryAgain')}
                  </Button>
                  <Link
                    href="/runs"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {t('runs.detail.back')}
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <RunView run={run} t={t} lang={lang} onRefresh={handleRefresh} refreshing={refreshing} />
        )}
      </div>
    </AppShell>
  );
}

function RunView({
  run,
  t,
  lang,
  onRefresh,
  refreshing,
}: {
  run: RunDetail;
  t: TranslateFn;
  lang: Lang;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const events = React.useMemo(
    () =>
      [...(run.events ?? [])].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [run.events],
  );

  const durationMs = runDurationMs(run);
  const output = collectModelOutput(events);
  const failureMessage = collectFailureMessage(events);
  const isFailed = run.status === 'failed';

  const proposedChanges = React.useMemo(() => proposedChangesFromEvents(events), [events]);
  const hasRepoContext = React.useMemo(
    () => events.some((event) => contextReadFromEvent(event) !== null),
    [events],
  );
  const showProposedChanges = proposedChanges !== null || hasRepoContext;

  const agentName = run.agent?.name ?? t('runs.unknownAgent');
  const agentId = run.agent?.id ?? run.agentId;
  const taskTitle = run.task?.title ?? t('runs.unknownTask');
  const taskId = run.task?.id ?? run.taskId;

  const router = useRouter();
  const [busy, setBusy] = React.useState<null | 'cancel' | 'retry'>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  // In flight → cancellable; finished → retryable. The API enforces the same
  // (member+); a viewer who somehow hits it gets an error shown below.
  const canCancel =
    run.status === 'running' || run.status === 'waiting_approval';
  const canRetry =
    run.status === 'completed' ||
    run.status === 'failed' ||
    run.status === 'cancelled';

  async function handleCancel() {
    setBusy('cancel');
    setActionError(null);
    try {
      await api.post(`/runs/${run.id}/cancel`);
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('runs.actionError'));
    } finally {
      setBusy(null);
    }
  }

  async function handleRetry() {
    setBusy('retry');
    setActionError(null);
    try {
      const created = await api.post<{ id: string }>(`/runs/${run.id}/retry`);
      router.push(`/runs/${created.id}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('runs.actionError'));
      setBusy(null);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Activity className="size-6" />
          </span>
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{taskTitle}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={runStatusVariant(run.status)} dot>
                {runStatusLabel(run.status, t)}
              </Badge>
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Bot className="size-3.5 shrink-0" />
                {agentName}
              </span>
              <span className="hidden text-muted-foreground/40 sm:inline">·</span>
              <span className="font-mono text-xs text-muted-foreground">{providerModel(run)}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {canCancel && (
              <Button
                variant="danger"
                size="md"
                onClick={handleCancel}
                disabled={busy !== null}
              >
                {busy === 'cancel' ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Ban />
                )}
                {busy === 'cancel' ? t('runs.cancelling') : t('runs.cancel')}
              </Button>
            )}
            {canRetry && (
              <Button
                variant="secondary"
                size="md"
                onClick={handleRetry}
                disabled={busy !== null}
              >
                {busy === 'retry' ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RotateCcw />
                )}
                {busy === 'retry' ? t('runs.retrying') : t('runs.retry')}
              </Button>
            )}
            <Button
              variant="secondary"
              size="md"
              onClick={onRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={cn(refreshing && 'animate-spin')} />
              {t('runs.refresh')}
            </Button>
          </div>
          {actionError && (
            <p className="flex items-center gap-1.5 text-xs text-danger sm:justify-end">
              <TriangleAlert className="size-3.5 shrink-0" />
              {actionError}
            </p>
          )}
        </div>
      </div>

      {/* Failure callout */}
      {isFailed && (
        <Card className="border-danger/30 bg-danger/5">
          <CardContent className="flex items-start gap-3 p-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-danger/10 text-danger ring-1 ring-inset ring-danger/25">
              <TriangleAlert className="size-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold text-danger">{t('runs.failed.title')}</p>
              <p
                dir="auto"
                className="whitespace-pre-wrap break-words text-sm text-foreground/90"
              >
                {failureMessage ?? t('runs.failed.unknownError')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          icon={DollarSign}
          label={t('runs.field.cost')}
          value={formatCost(run.costUsd, lang)}
        />
        <StatTile
          icon={ArrowDownToLine}
          label={t('runs.field.inputTokens')}
          value={formatNumber(run.inputTokens, lang)}
        />
        <StatTile
          icon={ArrowUpFromLine}
          label={t('runs.field.outputTokens')}
          value={formatNumber(run.outputTokens, lang)}
        />
        <StatTile
          icon={Timer}
          label={t('runs.field.duration')}
          value={durationMs === null ? '—' : formatDuration(durationMs, t)}
          muted={durationMs === null}
        />
      </div>

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle>{t('common.overview')}</CardTitle>
          <CardDescription>{t('runs.detail.overviewDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border border-t border-border">
            <MetaRow icon={ListTodo} label={t('runs.field.task')}>
              <MetaLink href={`/tasks/${taskId}`} label={taskTitle} />
            </MetaRow>
            <MetaRow icon={Bot} label={t('runs.field.agent')}>
              <MetaLink href={`/agents/${agentId}`} label={agentName} />
            </MetaRow>
            <MetaRow icon={Sparkles} label={t('common.provider')}>
              {run.provider}
            </MetaRow>
            <MetaRow icon={Cpu} label={t('runs.field.model')}>
              <span className="font-mono text-[13px]">{run.model}</span>
            </MetaRow>
            <MetaRow icon={CalendarClock} label={t('runs.field.started')}>
              {run.startedAt ? formatDateTime(run.startedAt, lang) : '—'}
            </MetaRow>
            <MetaRow icon={CalendarCheck} label={t('runs.field.completed')}>
              {run.completedAt ? formatDateTime(run.completedAt, lang) : '—'}
            </MetaRow>
            <MetaRow icon={CalendarPlus} label={t('common.created')}>
              {formatDateTime(run.createdAt, lang)}
            </MetaRow>
            <MetaRow icon={Hash} label={t('runs.field.runId')}>
              <code className="break-all font-mono text-xs text-muted-foreground">{run.id}</code>
            </MetaRow>
          </div>
        </CardContent>
      </Card>

      {/* Proposed changes */}
      {showProposedChanges && <ProposedChanges changes={proposedChanges} t={t} />}

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>{t('runs.timeline.title')}</CardTitle>
          <CardDescription>{t('runs.timeline.desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{t('runs.timeline.empty')}</p>
          ) : (
            <ol className="space-y-0">
              {events.map((event, i) => (
                <TimelineItem
                  key={event.id}
                  event={event}
                  last={i === events.length - 1}
                  t={t}
                  lang={lang}
                />
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Output — hidden when the agent produced structured changes, since the
          raw model text is then just the JSON already shown in Proposed changes. */}
      {!proposedChanges && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="size-4 text-muted-foreground" />
              {t('runs.output.title')}
            </CardTitle>
            <CardDescription>{t('runs.output.desc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {output ? (
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p
                  dir="auto"
                  className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground"
                >
                  {output}
                </p>
              </div>
            ) : (
              <p className="py-2 text-sm text-muted-foreground">{t('runs.output.empty')}</p>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  muted,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </div>
        <p
          className={cn(
            'mt-2 text-xl font-semibold tabular-nums tracking-tight',
            muted ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function MetaRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4 shrink-0" />
        {label}
      </span>
      <span className="min-w-0 text-end text-sm font-medium text-foreground">{children}</span>
    </div>
  );
}

function MetaLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex max-w-full items-center gap-1 text-primary transition-colors hover:underline"
    >
      <span className="truncate">{label}</span>
      <ChevronRight className="size-3.5 shrink-0 rtl:-scale-x-100" />
    </Link>
  );
}

function TimelineItem({
  event,
  last,
  t,
  lang,
}: {
  event: RunEvent;
  last: boolean;
  t: TranslateFn;
  lang: Lang;
}) {
  const tone = runEventTone(event.type);
  const rawMessage = event.payload?.message;
  const message =
    event.type === 'RUN_FAILED' && typeof rawMessage === 'string' ? rawMessage : null;
  const pullRequestUrl = pullRequestUrlFromEvent(event);
  const contextRead = contextReadFromEvent(event);
  const toolDetail = toolDetailFromEvent(event);

  return (
    <li className="relative flex gap-3 ps-6">
      {!last && (
        <span
          aria-hidden
          className="absolute bottom-0 start-[5px] top-4 w-px bg-border"
        />
      )}
      <span
        aria-hidden
        className={cn(
          'absolute start-0 top-1 size-2.5 rounded-full ring-4 ring-card',
          DOT_TONE[tone],
        )}
      />
      <div className={cn('min-w-0 flex-1', last ? 'pb-0' : 'pb-5')}>
        <p className="text-sm font-medium text-foreground">{runEventLabel(event.type, t)}</p>
        <p className="text-xs text-muted-foreground" title={formatRelativeTime(event.createdAt, lang)}>
          {formatDateTime(event.createdAt, lang)}
        </p>
        {message && (
          <p dir="auto" className="mt-1 whitespace-pre-wrap break-words text-sm text-danger">
            {message}
          </p>
        )}
        {contextRead && (
          <p className="mt-1 text-sm text-muted-foreground">
            {t('runs.context.readFiles', { count: contextRead.filesRead })}
          </p>
        )}
        {toolDetail && (
          <p dir="ltr" className="mt-1 font-mono text-xs text-muted-foreground">
            {toolDetail}
          </p>
        )}
        {pullRequestUrl && (
          <a
            href={pullRequestUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 text-sm font-medium text-primary shadow-xs transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <GitPullRequest className="size-4 shrink-0" />
            {t('runs.viewPullRequest')}
            <ExternalLink className="size-3.5 shrink-0" />
          </a>
        )}
      </div>
    </li>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="size-12 animate-pulse rounded-xl bg-muted" />
        <div className="space-y-2">
          <div className="h-6 w-56 animate-pulse rounded bg-muted" />
          <div className="h-5 w-48 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-2 p-4">
              <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              <div className="h-6 w-20 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="space-y-3 p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 w-full animate-pulse rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  Loader2,
  RefreshCw,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { usePendingApprovals } from '@/lib/approvals/context';
import { useAuth } from '@/lib/auth/context';
import { canManage } from '@/lib/auth/roles';
import { useI18n } from '@/lib/i18n/context';
import type { TranslateFn } from '@/lib/i18n/dictionary';
import { cn } from '@/lib/utils';
import {
  Approval,
  actionLabel,
  formatDateTime,
  formatRelativeTime,
  riskLabel,
  riskVariant,
  statusLabel,
  statusVariant,
} from './types';

/** Icon per known action type; a shield question mark stands in for the rest. */
const ACTION_ICON: Record<string, LucideIcon> = {
  read_repo: BookOpen,
  create_branch: GitBranch,
  commit: GitCommitHorizontal,
  open_pull_request: GitPullRequest,
  merge_pull_request: GitMerge,
  deploy_production: Rocket,
  delete_data: Trash2,
};

function actionIcon(actionType: string): LucideIcon {
  return ACTION_ICON[actionType] ?? ShieldQuestion;
}

/** A high/critical action gets a louder shield; otherwise a calm check. */
function riskIcon(level: string): LucideIcon {
  return level === 'high' || level === 'critical' ? ShieldAlert : ShieldCheck;
}

export default function ApprovalsPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  // Only owners/admins may resolve approvals (the API enforces this too);
  // non-managers get a read-only view of the same cards.
  const isManager = canManage(user?.role);
  const { refresh: refreshPendingBadge } = usePendingApprovals();
  const [approvals, setApprovals] = React.useState<Approval[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const data = await api.get<Approval[]>('/approvals');
      setApprovals(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('approvals.loadError'));
    }
  }, [t]);

  // Reload the list and refresh the sidebar's live pending badge together, so
  // resolving an approval updates both at once.
  const handleResolved = React.useCallback(async () => {
    await load();
    await refreshPendingBadge();
  }, [load, refreshPendingBadge]);

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

  const pending = approvals.filter((a) => a.status === 'pending');
  const resolved = approvals.filter((a) => a.status !== 'pending');
  const hasAny = approvals.length > 0;

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {t('approvals.title')}
              </h1>
              {!loading && !error && pending.length > 0 && (
                <Badge variant="warning">{pending.length}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{t('approvals.subtitle')}</p>
          </div>
          {!loading && !error && hasAny && (
            <Button variant="secondary" size="md" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={cn(refreshing && 'animate-spin')} />
              {t('approvals.refresh')}
            </Button>
          )}
        </div>

        {/* Content states */}
        {loading ? (
          <ApprovalsSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={handleRefresh} t={t} />
        ) : (
          <>
            {/* Pending — the primary focus of this screen */}
            <section className="space-y-4">
              <SectionHeading
                title={t('approvals.pending.title')}
                desc={t('approvals.pending.desc')}
                count={pending.length}
              />
              {pending.length === 0 ? (
                <PendingEmptyState t={t} />
              ) : (
                <div className="grid gap-4">
                  {pending.map((approval) => (
                    <PendingCard
                      key={approval.id}
                      approval={approval}
                      onResolved={handleResolved}
                      isManager={isManager}
                      t={t}
                      lang={lang}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Resolved */}
            <section className="space-y-4">
              <SectionHeading
                title={t('approvals.resolved.title')}
                desc={t('approvals.resolved.desc')}
                count={resolved.length}
              />
              {resolved.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                  {t('approvals.resolvedEmpty')}
                </p>
              ) : (
                <Card>
                  <CardContent className="divide-y divide-border p-0">
                    {resolved.map((approval) => (
                      <ResolvedRow key={approval.id} approval={approval} t={t} lang={lang} />
                    ))}
                  </CardContent>
                </Card>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function SectionHeading({
  title,
  desc,
  count,
}: {
  title: string;
  desc: string;
  count: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2.5">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        {count > 0 && <Badge variant="neutral">{count}</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

/** The run this approval belongs to: task title (primary) + agent (attributed). */
function RunReference({
  approval,
  t,
}: {
  approval: Approval;
  t: TranslateFn;
}) {
  const run = approval.run;
  const taskTitle = run?.task?.title ?? t('runs.unknownTask');
  const agentName = run?.agent?.name ?? t('runs.unknownAgent');
  const href = run ? `/runs/${run.id}` : `/runs/${approval.runId}`;

  return (
    <Link
      href={href}
      aria-label={`${t('approvals.viewRun')}: ${taskTitle}`}
      className="group/ref flex max-w-full items-center gap-1.5 rounded-md text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground transition-colors group-hover/ref:text-primary group-hover/ref:underline">
          {taskTitle}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Bot className="size-3 shrink-0" />
          <span className="truncate">
            {t('approvals.by')} {agentName}
          </span>
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" />
    </Link>
  );
}

function PendingCard({
  approval,
  onResolved,
  isManager,
  t,
  lang,
}: {
  approval: Approval;
  onResolved: () => Promise<void>;
  isManager: boolean;
  t: TranslateFn;
  lang: string;
}) {
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState<null | 'approve' | 'reject'>(null);
  const [error, setError] = React.useState<string | null>(null);

  const ActionIcon = actionIcon(approval.actionType);
  const RiskIcon = riskIcon(approval.riskLevel);
  const disabled = busy !== null;

  async function handleApprove() {
    setBusy('approve');
    setError(null);
    try {
      await api.post(`/approvals/${approval.id}/approve`);
      await onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('approvals.actionError'));
      setBusy(null);
    }
  }

  async function handleReject() {
    setBusy('reject');
    setError(null);
    try {
      const trimmed = reason.trim();
      await api.post(`/approvals/${approval.id}/reject`, {
        reason: trimmed || undefined,
      });
      await onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('approvals.actionError'));
      setBusy(null);
    }
  }

  return (
    <Card className="animate-fade-up overflow-hidden">
      <CardContent className="p-5">
        <div className="flex flex-col gap-4">
          {/* Top: action identity + risk */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <ActionIcon className="size-5" />
              </span>
              <div className="min-w-0 space-y-1">
                <h3 className="text-base font-semibold leading-tight text-foreground">
                  {actionLabel(approval.actionType, t)}
                </h3>
                <p
                  className="text-xs text-muted-foreground"
                  title={formatDateTime(approval.requestedAt, lang)}
                >
                  {t('approvals.requestedTime', {
                    time: formatRelativeTime(approval.requestedAt, lang),
                  })}
                </p>
              </div>
            </div>
            <Badge
              variant={riskVariant(approval.riskLevel)}
              aria-label={`${t('approvals.riskLabel')}: ${riskLabel(approval.riskLevel, t)}`}
            >
              <RiskIcon className="size-3.5" />
              {riskLabel(approval.riskLevel, t)}
            </Badge>
          </div>

          {/* Related run */}
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <RunReference approval={approval} t={t} />
          </div>

          {error && (
            <p className="flex items-center gap-1.5 text-sm text-danger">
              <TriangleAlert className="size-4 shrink-0" />
              {error}
            </p>
          )}

          {/* Decision controls — only owners/admins may resolve approvals */}
          {!isManager ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-3 text-center text-sm text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0" />
              {t('approvals.managersOnly')}
            </div>
          ) : rejecting ? (
            <div className="space-y-2.5 rounded-lg border border-danger/30 bg-danger/5 p-3">
              <label htmlFor={`reason-${approval.id}`} className="block text-sm font-medium text-foreground">
                {t('approvals.reasonLabel')}
              </label>
              <Input
                id={`reason-${approval.id}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('approvals.reasonPlaceholder')}
                maxLength={500}
                autoFocus
                disabled={disabled}
              />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRejecting(false);
                    setReason('');
                    setError(null);
                  }}
                  disabled={disabled}
                >
                  {t('common.cancel')}
                </Button>
                <Button variant="danger" size="sm" onClick={handleReject} disabled={disabled}>
                  {busy === 'reject' ? <Loader2 className="animate-spin" /> : <X />}
                  {busy === 'reject' ? t('approvals.rejecting') : t('approvals.confirmReject')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="danger"
                size="md"
                onClick={() => {
                  setError(null);
                  setRejecting(true);
                }}
                disabled={disabled}
              >
                <X />
                {t('approvals.reject')}
              </Button>
              <Button size="md" onClick={handleApprove} disabled={disabled}>
                {busy === 'approve' ? <Loader2 className="animate-spin" /> : <Check />}
                {busy === 'approve' ? t('approvals.approving') : t('approvals.approve')}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ResolvedRow({
  approval,
  t,
  lang,
}: {
  approval: Approval;
  t: TranslateFn;
  lang: string;
}) {
  const ActionIcon = actionIcon(approval.actionType);
  const resolvedIso = approval.resolvedAt ?? approval.requestedAt;

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <ActionIcon className="size-4" />
        </span>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {actionLabel(approval.actionType, t)}
            </span>
            <Badge variant={riskVariant(approval.riskLevel)}>
              {riskLabel(approval.riskLevel, t)}
            </Badge>
          </div>
          <RunReference approval={approval} t={t} />
          {approval.status === 'rejected' && approval.reason?.trim() && (
            <p className="text-xs text-muted-foreground" dir="auto">
              <span className="font-medium text-foreground/80">{t('approvals.reason')}:</span>{' '}
              {approval.reason}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
        <Badge variant={statusVariant(approval.status)} dot>
          {statusLabel(approval.status, t)}
        </Badge>
        <span
          className="text-xs text-muted-foreground"
          title={formatDateTime(resolvedIso, lang)}
        >
          {t('approvals.resolvedTime', { time: formatRelativeTime(resolvedIso, lang) })}
        </span>
      </div>
    </div>
  );
}

function PendingEmptyState({ t }: { t: TranslateFn }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-success/10 text-success ring-1 ring-inset ring-success/25">
        <ShieldCheck className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{t('approvals.emptyTitle')}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{t('approvals.emptyDesc')}</p>
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
        <p className="text-sm font-semibold text-foreground">{t('approvals.loadErrorTitle')}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{message}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        <RefreshCw />
        {t('common.tryAgain')}
      </Button>
    </div>
  );
}

function ApprovalsSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="h-5 w-28 animate-pulse rounded bg-muted" />
          <div className="h-3.5 w-56 max-w-full animate-pulse rounded bg-muted" />
        </div>
        <div className="grid gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="size-10 shrink-0 animate-pulse rounded-lg bg-muted" />
                    <div className="space-y-2">
                      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                  <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
                </div>
                <div className="h-12 w-full animate-pulse rounded-lg bg-muted" />
                <div className="flex justify-end gap-2">
                  <div className="h-9 w-24 animate-pulse rounded-lg bg-muted" />
                  <div className="h-9 w-24 animate-pulse rounded-lg bg-muted" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

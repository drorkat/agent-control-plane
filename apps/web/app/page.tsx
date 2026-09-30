'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Bot,
  CalendarDays,
  DollarSign,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  Inbox,
  ListTodo,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  ShieldQuestion,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import type { BadgeVariant } from '@/components/ui/badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n/context';
import type { TranslateFn, TranslationKey } from '@/lib/i18n/dictionary';
import { cn } from '@/lib/utils';

// ── API shape (GET /api/dashboard/stats) ──────────────────────────────────

interface DashboardRun {
  id: string;
  status: string;
  model: string;
  createdAt: string;
  agent: { id: string; name: string } | null;
  task: { id: string; title: string } | null;
}

interface DashboardApprovalItem {
  id: string;
  actionType: string;
  riskLevel: string;
  requestedAt: string;
}

interface DashboardStats {
  agents: number;
  openTasks: number;
  pendingApprovals: number;
  costThisMonth: number;
  recentRuns: DashboardRun[];
  pendingApprovalItems: DashboardApprovalItem[];
}

// ── formatting + mapping helpers ──────────────────────────────────────────

/** Locale-aware integer (thousands separators). */
function formatCount(value: number, lang: string): string {
  try {
    return new Intl.NumberFormat(lang).format(value);
  } catch {
    return String(value);
  }
}

/** USD amount with a `$` prefix; shows cents only when present. */
function formatMoney(value: number, lang: string): string {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  try {
    return `$${new Intl.NumberFormat(lang, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(safe)}`;
  } catch {
    return `$${safe.toFixed(2)}`;
  }
}

const RUN_STATUS: Record<string, { variant: BadgeVariant; key: TranslationKey }> = {
  running: { variant: 'primary', key: 'runs.status.running' },
  completed: { variant: 'success', key: 'runs.status.completed' },
  failed: { variant: 'danger', key: 'runs.status.failed' },
};

const ACTION_ICON: Record<string, LucideIcon> = {
  read_repo: BookOpen,
  create_branch: GitBranch,
  commit: GitCommitHorizontal,
  open_pull_request: GitPullRequest,
  merge_pull_request: GitMerge,
  deploy_production: Rocket,
  delete_data: Trash2,
};

const ACTION_KEY: Record<string, TranslationKey> = {
  read_repo: 'approvals.action.read_repo',
  create_branch: 'approvals.action.create_branch',
  commit: 'approvals.action.commit',
  open_pull_request: 'approvals.action.open_pull_request',
  merge_pull_request: 'approvals.action.merge_pull_request',
  deploy_production: 'approvals.action.deploy_production',
  delete_data: 'approvals.action.delete_data',
};

const RISK_KEY: Record<string, TranslationKey> = {
  low: 'approvals.risk.low',
  medium: 'approvals.risk.medium',
  high: 'approvals.risk.high',
  critical: 'approvals.risk.critical',
};

const RISK_VARIANT: Record<string, BadgeVariant> = {
  low: 'neutral',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};

/** Translated action label; unknown types are humanized from their raw value. */
function actionLabel(actionType: string, t: TranslateFn): string {
  const key = ACTION_KEY[actionType];
  if (key) return t(key);
  return (
    actionType
      .replace(/[_-]+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase()) || actionType
  );
}

function riskLabel(level: string, t: TranslateFn): string {
  const key = RISK_KEY[level];
  return key ? t(key) : level;
}

// ── page ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { t, lang } = useI18n();
  const [data, setData] = React.useState<DashboardStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const stats = await api.get<DashboardStats>('/dashboard/stats');
      setData(stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('dashboard.loadError'));
    }
  }, [t]);

  React.useEffect(() => {
    void (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {t('dashboard.title')}
              </h1>
              <Badge variant="primary">{t('dashboard.badge')}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="md">
              <CalendarDays />
              {t('dashboard.last7days')}
            </Button>
            <Button size="md">
              <Plus />
              {t('dashboard.newTask')}
            </Button>
          </div>
        </div>

        {/* Content states */}
        {loading ? (
          <DashboardSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={load} t={t} />
        ) : data ? (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label={t('dashboard.stats.activeAgents')}
                value={formatCount(data.agents, lang)}
                icon={Bot}
                iconTint="bg-primary/10 text-primary"
                hint={t('dashboard.stats.activeAgentsHint')}
              />
              <StatCard
                label={t('dashboard.stats.openTasks')}
                value={formatCount(data.openTasks, lang)}
                icon={ListTodo}
                iconTint="bg-muted text-muted-foreground"
                hint={t('dashboard.stats.openTasksHint')}
              />
              <StatCard
                label={t('dashboard.stats.pendingApprovals')}
                value={formatCount(data.pendingApprovals, lang)}
                icon={ShieldCheck}
                iconTint="bg-warning/10 text-warning"
                hint={t('dashboard.stats.awaitingReview')}
              />
              <StatCard
                label={t('dashboard.stats.cost')}
                value={formatMoney(data.costThisMonth, lang)}
                icon={DollarSign}
                iconTint="bg-success/10 text-success"
                hint={t('dashboard.stats.costHint')}
              />
            </div>

            {/* Panels */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
              <RecentRunsPanel runs={data.recentRuns} t={t} />
              <PendingApprovalsPanel items={data.pendingApprovalItems} t={t} />
            </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

// ── stat card ───────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  iconTint,
  hint,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  iconTint: string;
  hint: string;
}) {
  return (
    <Card className="transition-shadow duration-200 hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', iconTint)}>
            <Icon className="size-[18px]" />
          </span>
        </div>
        <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
          {value}
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

// ── panels ────────────────────────────────────────────────────────────────

function RecentRunsPanel({ runs, t }: { runs: DashboardRun[]; t: TranslateFn }) {
  return (
    <Card className="lg:col-span-3">
      <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>{t('dashboard.recentRuns.title')}</CardTitle>
          <CardDescription>{t('dashboard.recentRuns.desc')}</CardDescription>
        </div>
        <PanelHeaderLink href="/runs" label={t('dashboard.recentRuns.viewAll')} />
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <EmptyState
            icon={Activity}
            title={t('dashboard.recentRuns.emptyTitle')}
            description={t('dashboard.recentRuns.emptyDesc')}
            actionLabel={t('dashboard.recentRuns.action')}
          />
        ) : (
          <div className="-mx-2 space-y-0.5">
            {runs.map((run) => {
              const meta = RUN_STATUS[run.status];
              return (
                <Link
                  key={run.id}
                  href={`/runs/${run.id}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <Bot className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {run.agent?.name ?? t('runs.unknownAgent')}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {run.task?.title ?? t('runs.unknownTask')}
                    </span>
                  </span>
                  <Badge variant={meta?.variant ?? 'neutral'} dot>
                    {meta ? t(meta.key) : run.status}
                  </Badge>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PendingApprovalsPanel({
  items,
  t,
}: {
  items: DashboardApprovalItem[];
  t: TranslateFn;
}) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>{t('dashboard.approvals.title')}</CardTitle>
          <CardDescription>{t('dashboard.approvals.desc')}</CardDescription>
        </div>
        <PanelHeaderLink href="/approvals" label={t('dashboard.approvals.review')} />
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={t('dashboard.approvals.emptyTitle')}
            description={t('dashboard.approvals.emptyDesc')}
            actionLabel={t('dashboard.approvals.action')}
          />
        ) : (
          <div className="-mx-2 space-y-0.5">
            {items.map((item) => {
              const ActionIcon = ACTION_ICON[item.actionType] ?? ShieldQuestion;
              return (
                <Link
                  key={item.id}
                  href="/approvals"
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <ActionIcon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {actionLabel(item.actionType, t)}
                  </span>
                  <Badge variant={RISK_VARIANT[item.riskLevel] ?? 'neutral'}>
                    {riskLabel(item.riskLevel, t)}
                  </Badge>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** A ghost-styled panel action rendered as a navigating link. */
function PanelHeaderLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="-me-2 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {label}
      <ArrowUpRight className="size-4 rtl:-scale-x-100" />
    </Link>
  );
}

// ── shared states ─────────────────────────────────────────────────────────

function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-card text-muted-foreground shadow-xs ring-1 ring-border">
        <Icon className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mx-auto max-w-xs text-sm text-muted-foreground">{description}</p>
      </div>
      <Button variant="secondary" size="sm">
        {actionLabel}
      </Button>
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
        <p className="text-sm font-semibold text-foreground">{t('dashboard.loadErrorTitle')}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{message}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        <RefreshCw />
        {t('common.tryAgain')}
      </Button>
    </div>
  );
}

// ── loading skeleton ──────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="size-9 animate-pulse rounded-lg bg-muted" />
              </div>
              <div className="mt-3 h-8 w-16 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-3 w-20 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <PanelSkeleton className="lg:col-span-3" rows={4} />
        <PanelSkeleton className="lg:col-span-2" rows={3} />
      </div>
    </>
  );
}

function PanelSkeleton({ className, rows }: { className?: string; rows: number }) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          <div className="h-3 w-40 max-w-full animate-pulse rounded bg-muted" />
        </div>
        <div className="h-8 w-16 animate-pulse rounded-md bg-muted" />
      </CardHeader>
      <CardContent className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-1">
            <div className="size-8 shrink-0 animate-pulse rounded-lg bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-32 max-w-full animate-pulse rounded bg-muted" />
              <div className="h-3 w-44 max-w-full animate-pulse rounded bg-muted" />
            </div>
            <div className="h-5 w-16 shrink-0 animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

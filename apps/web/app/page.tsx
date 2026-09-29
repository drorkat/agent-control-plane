'use client';

import {
  Activity,
  ArrowUpRight,
  Bot,
  CalendarDays,
  DollarSign,
  Inbox,
  ListTodo,
  Plus,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n/context';
import type { TranslationKey } from '@/lib/i18n/dictionary';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'warning' | 'muted';
type Trend = 'up' | 'down' | null;

type Stat = {
  labelKey: TranslationKey;
  value: string;
  icon: LucideIcon;
  iconTint: string;
  /** A literal, non-translated delta (e.g. "+3", "-8%")… */
  delta?: string;
  /** …or a dictionary key when the delta contains words (e.g. "2 urgent"). */
  deltaKey?: TranslationKey;
  hintKey: TranslationKey;
  tone: Tone;
  trend: Trend;
};

const toneText: Record<Tone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  muted: 'text-muted-foreground',
};

const STATS: Stat[] = [
  {
    labelKey: 'dashboard.stats.activeAgents',
    value: '12',
    icon: Bot,
    iconTint: 'bg-primary/10 text-primary',
    delta: '+3',
    hintKey: 'dashboard.stats.vsLastWeek',
    tone: 'success',
    trend: 'up',
  },
  {
    labelKey: 'dashboard.stats.openTasks',
    value: '48',
    icon: ListTodo,
    iconTint: 'bg-muted text-muted-foreground',
    delta: '+12',
    hintKey: 'dashboard.stats.vsLastWeek',
    tone: 'muted',
    trend: 'up',
  },
  {
    labelKey: 'dashboard.stats.pendingApprovals',
    value: '3',
    icon: ShieldCheck,
    iconTint: 'bg-warning/10 text-warning',
    deltaKey: 'dashboard.stats.urgent2',
    hintKey: 'dashboard.stats.awaitingReview',
    tone: 'warning',
    trend: null,
  },
  {
    labelKey: 'dashboard.stats.cost',
    value: '$1,284',
    icon: DollarSign,
    iconTint: 'bg-success/10 text-success',
    delta: '-8%',
    hintKey: 'dashboard.stats.vsLastMonth',
    tone: 'success',
    trend: 'down',
  },
];

function StatCard({ stat }: { stat: Stat }) {
  const { t } = useI18n();
  const TrendIcon = stat.trend === 'up' ? TrendingUp : stat.trend === 'down' ? TrendingDown : null;
  const delta = stat.deltaKey ? t(stat.deltaKey) : stat.delta;
  return (
    <Card className="transition-shadow duration-200 hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">{t(stat.labelKey)}</p>
          <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', stat.iconTint)}>
            <stat.icon className="size-[18px]" />
          </span>
        </div>
        <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
          {stat.value}
        </p>
        <p className="mt-1.5 flex items-center gap-1 text-xs">
          {TrendIcon && <TrendIcon className={cn('size-3.5', toneText[stat.tone])} />}
          <span className={cn('font-semibold', toneText[stat.tone])}>{delta}</span>
          <span className="text-muted-foreground">{t(stat.hintKey)}</span>
        </p>
      </CardContent>
    </Card>
  );
}

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

function PanelHeaderAction({ label }: { label: string }) {
  return (
    <Button variant="ghost" size="sm" className="-me-2 text-muted-foreground">
      {label}
      <ArrowUpRight className="rtl:-scale-x-100" />
    </Button>
  );
}

export default function DashboardPage() {
  const { t } = useI18n();
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

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {STATS.map((stat) => (
            <StatCard key={stat.labelKey} stat={stat} />
          ))}
        </div>

        {/* Panels */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
              <div className="space-y-1">
                <CardTitle>{t('dashboard.recentRuns.title')}</CardTitle>
                <CardDescription>{t('dashboard.recentRuns.desc')}</CardDescription>
              </div>
              <PanelHeaderAction label={t('dashboard.recentRuns.viewAll')} />
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={Activity}
                title={t('dashboard.recentRuns.emptyTitle')}
                description={t('dashboard.recentRuns.emptyDesc')}
                actionLabel={t('dashboard.recentRuns.action')}
              />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
              <div className="space-y-1">
                <CardTitle>{t('dashboard.approvals.title')}</CardTitle>
                <CardDescription>{t('dashboard.approvals.desc')}</CardDescription>
              </div>
              <PanelHeaderAction label={t('dashboard.approvals.review')} />
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={Inbox}
                title={t('dashboard.approvals.emptyTitle')}
                description={t('dashboard.approvals.emptyDesc')}
                actionLabel={t('dashboard.approvals.action')}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

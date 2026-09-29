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
import { cn } from '@/lib/utils';

type Tone = 'success' | 'warning' | 'muted';
type Trend = 'up' | 'down' | null;

type Stat = {
  label: string;
  value: string;
  icon: LucideIcon;
  iconTint: string;
  delta: string;
  hint: string;
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
    label: 'Active Agents',
    value: '12',
    icon: Bot,
    iconTint: 'bg-primary/10 text-primary',
    delta: '+3',
    hint: 'vs last week',
    tone: 'success',
    trend: 'up',
  },
  {
    label: 'Open Tasks',
    value: '48',
    icon: ListTodo,
    iconTint: 'bg-muted text-muted-foreground',
    delta: '+12',
    hint: 'vs last week',
    tone: 'muted',
    trend: 'up',
  },
  {
    label: 'Pending Approvals',
    value: '3',
    icon: ShieldCheck,
    iconTint: 'bg-warning/10 text-warning',
    delta: '2 urgent',
    hint: 'awaiting review',
    tone: 'warning',
    trend: null,
  },
  {
    label: 'Cost this month',
    value: '$1,284',
    icon: DollarSign,
    iconTint: 'bg-success/10 text-success',
    delta: '-8%',
    hint: 'vs last month',
    tone: 'success',
    trend: 'down',
  },
];

function StatCard({ stat }: { stat: Stat }) {
  const TrendIcon = stat.trend === 'up' ? TrendingUp : stat.trend === 'down' ? TrendingDown : null;
  return (
    <Card className="transition-shadow duration-200 hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
          <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', stat.iconTint)}>
            <stat.icon className="size-[18px]" />
          </span>
        </div>
        <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
          {stat.value}
        </p>
        <p className="mt-1.5 flex items-center gap-1 text-xs">
          {TrendIcon && <TrendIcon className={cn('size-3.5', toneText[stat.tone])} />}
          <span className={cn('font-semibold', toneText[stat.tone])}>{stat.delta}</span>
          <span className="text-muted-foreground">{stat.hint}</span>
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
    <Button variant="ghost" size="sm" className="-mr-2 text-muted-foreground">
      {label}
      <ArrowUpRight />
    </Button>
  );
}

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</h1>
              <Badge variant="primary">Pre-alpha</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Monitor your agents, tasks, and approvals — all under human control.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="md">
              <CalendarDays />
              Last 7 days
            </Button>
            <Button size="md">
              <Plus />
              New task
            </Button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {STATS.map((stat) => (
            <StatCard key={stat.label} stat={stat} />
          ))}
        </div>

        {/* Panels */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
              <div className="space-y-1">
                <CardTitle>Recent Runs</CardTitle>
                <CardDescription>Latest agent executions across your projects</CardDescription>
              </div>
              <PanelHeaderAction label="View all" />
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={Activity}
                title="No runs yet"
                description="Once your agents start executing tasks, their runs and live logs will appear here."
                actionLabel="Start a run"
              />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
              <div className="space-y-1">
                <CardTitle>Pending Approvals</CardTitle>
                <CardDescription>Risky actions waiting on a human</CardDescription>
              </div>
              <PanelHeaderAction label="Review" />
            </CardHeader>
            <CardContent>
              <EmptyState
                icon={Inbox}
                title="You're all caught up"
                description="Approvals routed to you for merges, deploys, and other risky steps show up here."
                actionLabel="Configure policies"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

'use client';

import * as React from 'react';
import {
  AlertCircle,
  CalendarClock,
  Clock,
  History,
  Info,
  Loader2,
  Pause,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/context';
import { canManage } from '@/lib/auth/roles';
import { useI18n } from '@/lib/i18n/context';
import type { TranslateFn } from '@/lib/i18n/dictionary';
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  setScheduleActive,
  type Schedule,
} from '@/lib/schedules';
import type { AgentRef, Task } from '@/app/tasks/types';
import { formatDateTime, formatRelativeTime } from '@/app/runs/types';
import { cn } from '@/lib/utils';

// Shared control styling (mirrors the Input component and the team/tasks pages)
// minus a fixed height, so each <select> can match Input's h-9.
const fieldControl =
  'flex w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-xs ' +
  'transition-colors placeholder:text-muted-foreground ' +
  'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const labelClass = 'block text-sm font-medium text-foreground';

const DEFAULT_INTERVAL = '60';

/** The task title for a schedule: the joined title, then the tasks map, then the id. */
function scheduleTitle(schedule: Schedule, taskTitles: Map<string, string>): string {
  const joined = schedule.taskTitle?.trim();
  if (joined) return joined;
  const mapped = taskTitles.get(schedule.taskId)?.trim();
  if (mapped) return mapped;
  return schedule.taskId;
}

// ── page ────────────────────────────────────────────────────────────────────

export default function AutomationPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const isManager = canManage(user?.role);

  const [schedules, setSchedules] = React.useState<Schedule[]>([]);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [agents, setAgents] = React.useState<AgentRef[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [scheduleData, taskData, agentData] = await Promise.all([
        listSchedules(),
        api.get<Task[]>('/tasks'),
        api.get<AgentRef[]>('/agents'),
      ]);
      setSchedules(scheduleData);
      setTasks(taskData);
      setAgents(agentData);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('automation.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const taskTitles = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) map.set(task.id, task.title);
    return map;
  }, [tasks]);

  const hasSchedules = schedules.length > 0;

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {t('automation.title')}
              </h1>
              {!loading && !error && hasSchedules && (
                <Badge variant="neutral">{schedules.length}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{t('automation.subtitle')}</p>
          </div>

          {isManager && (
            <Button
              variant={showForm ? 'secondary' : 'primary'}
              size="md"
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? (
                <>
                  <X />
                  {t('common.cancel')}
                </>
              ) : (
                <>
                  <Plus />
                  {t('automation.create')}
                </>
              )}
            </Button>
          )}
        </div>

        {/* Read-only notice for non-managers */}
        {!isManager && (
          <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            <Info className="size-4 shrink-0 translate-y-0.5" />
            <span>{t('automation.onlyManagers')}</span>
          </div>
        )}

        {/* Inline create form (managers only) */}
        {isManager && showForm && (
          <ScheduleForm
            tasks={tasks}
            agents={agents}
            onCreated={load}
            onClose={() => setShowForm(false)}
            t={t}
          />
        )}

        {/* Content states */}
        {loading ? (
          <ScheduleListSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={load} t={t} />
        ) : !hasSchedules ? (
          <EmptyState
            canCreate={isManager}
            onCreate={() => setShowForm(true)}
            t={t}
          />
        ) : (
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {schedules.map((schedule) => (
                <ScheduleRow
                  key={schedule.id}
                  schedule={schedule}
                  title={scheduleTitle(schedule, taskTitles)}
                  isManager={isManager}
                  onChanged={load}
                  t={t}
                  lang={lang}
                />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

// ── create form ───────────────────────────────────────────────────────────

function ScheduleForm({
  tasks,
  agents,
  onCreated,
  onClose,
  t,
}: {
  tasks: Task[];
  agents: AgentRef[];
  onCreated: () => void | Promise<void>;
  onClose: () => void;
  t: TranslateFn;
}) {
  const [taskId, setTaskId] = React.useState('');
  const [agentId, setAgentId] = React.useState('');
  const [intervalInput, setIntervalInput] = React.useState(DEFAULT_INTERVAL);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const intervalMinutes = Math.floor(Number(intervalInput));
  const intervalValid = Number.isFinite(intervalMinutes) && intervalMinutes >= 1;
  const canSubmit = taskId !== '' && intervalValid;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await createSchedule({
        taskId,
        agentId: agentId || undefined,
        intervalMinutes,
      });
      await onCreated();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('automation.createError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="animate-fade-up">
      <CardContent className="p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <CalendarClock className="size-[18px]" />
          </span>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {t('automation.create')}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="schedule-task" className={labelClass}>
                {t('automation.task')} <span className="text-danger">*</span>
              </label>
              <select
                id="schedule-task"
                required
                className={cn(fieldControl, 'h-9 py-1')}
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                disabled={submitting}
              >
                <option value="" disabled>
                  {t('automation.selectTask')}
                </option>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="schedule-agent" className={labelClass}>
                {t('automation.agent')}
              </label>
              <select
                id="schedule-agent"
                className={cn(fieldControl, 'h-9 py-1')}
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                disabled={submitting}
              >
                <option value="">{t('automation.agentDefault')}</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="schedule-interval" className={labelClass}>
                {t('automation.interval')} <span className="text-danger">*</span>
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="schedule-interval"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  className="w-24"
                  dir="ltr"
                  value={intervalInput}
                  onChange={(e) => setIntervalInput(e.target.value)}
                  disabled={submitting}
                />
                <span className="text-sm text-muted-foreground">{t('automation.minutes')}</span>
              </div>
            </div>
          </div>

          {formError && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={onClose}
              disabled={submitting}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="md" disabled={submitting || !canSubmit}>
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" />
                  {t('automation.creating')}
                </>
              ) : (
                <>
                  <Plus />
                  {t('automation.submit')}
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── schedule row ──────────────────────────────────────────────────────────

function ScheduleRow({
  schedule,
  title,
  isManager,
  onChanged,
  t,
  lang,
}: {
  schedule: Schedule;
  title: string;
  isManager: boolean;
  onChanged: () => void | Promise<void>;
  t: TranslateFn;
  lang: string;
}) {
  const [toggling, setToggling] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const busy = toggling || deleting;

  async function handleToggle() {
    setToggling(true);
    setError(null);
    try {
      await setScheduleActive(schedule.id, !schedule.active);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('automation.updateError'));
      setToggling(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteSchedule(schedule.id);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('automation.deleteError'));
      setDeleting(false);
    }
  }

  const lastRun = schedule.lastRunAt
    ? formatRelativeTime(schedule.lastRunAt, lang)
    : t('automation.never');
  const nextRun = schedule.nextRunAt
    ? formatRelativeTime(schedule.nextRunAt, lang)
    : t('automation.never');

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Identity + cadence */}
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
          <CalendarClock className="size-[18px]" />
        </span>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{title}</span>
            <Badge variant={schedule.active ? 'success' : 'neutral'} dot>
              {schedule.active ? t('automation.active') : t('automation.paused')}
            </Badge>
          </div>
          {schedule.name && (
            <p className="truncate text-xs text-muted-foreground">{schedule.name}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Repeat className="size-3.5 shrink-0" />
              {t('automation.everyMinutes', { count: schedule.intervalMinutes })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <History className="size-3.5 shrink-0" />
              {t('automation.lastRun')}
              <span
                className="font-medium text-foreground/90"
                title={schedule.lastRunAt ? formatDateTime(schedule.lastRunAt, lang) : undefined}
              >
                {lastRun}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5 shrink-0" />
              {t('automation.nextRun')}
              <span
                className="font-medium text-foreground/90"
                title={schedule.nextRunAt ? formatDateTime(schedule.nextRunAt, lang) : undefined}
              >
                {nextRun}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Controls (managers only) */}
      {isManager && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {error && (
            <span className="flex items-center gap-1.5 text-xs text-danger sm:me-auto">
              <AlertCircle className="size-3.5 shrink-0" />
              {error}
            </span>
          )}

          <Button variant="ghost" size="sm" onClick={handleToggle} disabled={busy || confirming}>
            {toggling ? (
              <Loader2 className="animate-spin" />
            ) : schedule.active ? (
              <Pause />
            ) : (
              <Play />
            )}
            {schedule.active ? t('automation.pause') : t('automation.resume')}
          </Button>

          {confirming ? (
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <span className="text-xs text-muted-foreground">{t('automation.confirmDelete')}</span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirming(false)}
                  disabled={deleting}
                >
                  {t('common.cancel')}
                </Button>
                <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
                  {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  {deleting ? t('automation.deleting') : t('automation.delete')}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(true)}
              disabled={busy}
            >
              <Trash2 />
              {t('automation.delete')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── states ──────────────────────────────────────────────────────────────────

function EmptyState({
  canCreate,
  onCreate,
  t,
}: {
  canCreate: boolean;
  onCreate: () => void;
  t: TranslateFn;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-14 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-card text-muted-foreground shadow-xs ring-1 ring-border">
        <CalendarClock className="size-5" />
      </span>
      <p className="text-sm font-semibold text-foreground">{t('automation.empty')}</p>
      {canCreate && (
        <Button variant="secondary" size="sm" onClick={onCreate}>
          <Plus />
          {t('automation.create')}
        </Button>
      )}
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
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-danger/30 bg-danger/5 px-6 py-14 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-card text-danger shadow-xs ring-1 ring-danger/25">
        <TriangleAlert className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{t('automation.loadError')}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{message}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        <RotateCcw />
        {t('common.tryAgain')}
      </Button>
    </div>
  );
}

function ScheduleListSkeleton() {
  return (
    <Card>
      <CardContent className="divide-y divide-border p-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <div className="size-10 shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="h-3 w-56 max-w-full animate-pulse rounded bg-muted" />
            </div>
            <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Bot,
  CalendarClock,
  CalendarPlus,
  ChevronRight,
  CircleDot,
  Flag,
  FolderKanban,
  Hash,
  ListTodo,
  Loader2,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
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
import { cn } from '@/lib/utils';
import {
  AgentRef,
  ProjectRef,
  TASK_STATUS_ORDER,
  Task,
  taskPriorityLabel,
  taskPriorityVariant,
  taskStatusLabel,
  taskStatusVariant,
} from '../types';

const fieldControl =
  'flex h-9 w-full rounded-lg border border-input bg-card px-3 py-1 text-sm text-foreground shadow-xs ' +
  'transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50';

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function BackLink() {
  const { t } = useI18n();
  return (
    <Link
      href="/tasks"
      className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <ArrowLeft className="size-4 rtl:-scale-x-100" />
      {t('tasks.detail.back')}
    </Link>
  );
}

function MetaRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Hash;
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

export default function TaskDetailPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string | string[] }>();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const router = useRouter();

  const [task, setTask] = React.useState<Task | null>(null);
  const [projects, setProjects] = React.useState<ProjectRef[]>([]);
  const [agents, setAgents] = React.useState<AgentRef[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [savingStatus, setSavingStatus] = React.useState(false);
  const [statusError, setStatusError] = React.useState<string | null>(null);

  const [confirming, setConfirming] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [taskData, projectsData, agentsData] = await Promise.all([
        api.get<Task>(`/tasks/${id}`),
        api.get<ProjectRef[]>('/projects'),
        api.get<AgentRef[]>('/agents'),
      ]);
      setTask(taskData);
      setProjects(projectsData);
      setAgents(agentsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tasks.loadError'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const project = task ? projects.find((p) => p.id === task.projectId) : undefined;
  const agent =
    task && task.assignedAgentId
      ? agents.find((a) => a.id === task.assignedAgentId)
      : undefined;

  async function handleStatusChange(nextStatus: string) {
    if (!id || !task || nextStatus === task.status) return;
    setSavingStatus(true);
    setStatusError(null);
    try {
      const updated = await api.patch<Task>(`/tasks/${id}`, { status: nextStatus });
      setTask(updated);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : t('tasks.detail.statusError'));
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/tasks/${id}`);
      router.push('/tasks');
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t('tasks.detail.deleteError'));
      setDeleting(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <BackLink />

        {loading ? (
          <DetailSkeleton />
        ) : error || !task ? (
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <span className="grid size-11 place-items-center rounded-full bg-danger/10 text-danger ring-1 ring-inset ring-danger/25">
                  <TriangleAlert className="size-5" />
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {t('tasks.detail.loadErrorTitle')}
                  </p>
                  <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                    {error ?? t('tasks.detail.notFound')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => void load()}>
                    <RefreshCw />
                    {t('common.tryAgain')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => router.push('/tasks')}>
                    {t('tasks.detail.back')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <ListTodo className="size-6" />
                </span>
                <div className="min-w-0 space-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                    {task.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={taskStatusVariant(task.status)} dot>
                      {taskStatusLabel(task.status, t)}
                    </Badge>
                    <Badge variant={taskPriorityVariant(task.priority)}>
                      {taskPriorityLabel(task.priority, t)}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Overview */}
            <Card>
              <CardHeader>
                <CardTitle>{t('common.overview')}</CardTitle>
                <CardDescription>{t('tasks.detail.overviewDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {t('common.description')}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {task.description?.trim() || (
                      <span className="text-muted-foreground">{t('common.noDescription')}</span>
                    )}
                  </p>
                </div>

                {/* Status control */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="task-status"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70"
                  >
                    {t('common.status')}
                  </label>
                  <div className="flex items-center gap-3">
                    <select
                      id="task-status"
                      className={cn(fieldControl, 'max-w-xs')}
                      value={task.status}
                      onChange={(e) => void handleStatusChange(e.target.value)}
                      disabled={savingStatus}
                    >
                      {TASK_STATUS_ORDER.map((value) => (
                        <option key={value} value={value}>
                          {taskStatusLabel(value, t)}
                        </option>
                      ))}
                    </select>
                    {savingStatus && (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" />
                        {t('common.saving')}
                      </span>
                    )}
                  </div>
                  {statusError && (
                    <p className="flex items-center gap-1.5 text-sm text-danger">
                      <TriangleAlert className="size-4 shrink-0" />
                      {statusError}
                    </p>
                  )}
                </div>

                <div className="divide-y divide-border border-t border-border">
                  <MetaRow icon={FolderKanban} label={t('tasks.form.project')}>
                    {project ? (
                      <Link
                        href={`/projects/${task.projectId}`}
                        className="inline-flex items-center gap-1 text-primary transition-colors hover:underline"
                      >
                        <span className="truncate">{project.name}</span>
                        <ChevronRight className="size-3.5 shrink-0 rtl:-scale-x-100" />
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{t('tasks.card.unknownProject')}</span>
                    )}
                  </MetaRow>

                  <MetaRow icon={Bot} label={t('tasks.form.assignee')}>
                    {task.assignedAgentId ? (
                      agent ? (
                        <Link
                          href={`/agents/${task.assignedAgentId}`}
                          className="inline-flex items-center gap-1 text-primary transition-colors hover:underline"
                        >
                          <span className="truncate">{agent.name}</span>
                          <ChevronRight className="size-3.5 shrink-0 rtl:-scale-x-100" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{t('tasks.detail.unknownAgent')}</span>
                      )
                    ) : (
                      <span className="text-muted-foreground">{t('common.unassigned')}</span>
                    )}
                  </MetaRow>

                  <MetaRow icon={Flag} label={t('common.priority')}>
                    <Badge variant={taskPriorityVariant(task.priority)}>
                      {taskPriorityLabel(task.priority, t)}
                    </Badge>
                  </MetaRow>

                  <MetaRow icon={CircleDot} label={t('common.status')}>
                    <Badge variant={taskStatusVariant(task.status)} dot>
                      {taskStatusLabel(task.status, t)}
                    </Badge>
                  </MetaRow>

                  <MetaRow icon={CalendarPlus} label={t('common.created')}>
                    {formatDateTime(task.createdAt)}
                  </MetaRow>
                  <MetaRow icon={CalendarClock} label={t('common.lastUpdated')}>
                    {formatDateTime(task.updatedAt)}
                  </MetaRow>
                  <MetaRow icon={Hash} label={t('tasks.detail.taskId')}>
                    <code className="break-all font-mono text-xs text-muted-foreground">
                      {task.id}
                    </code>
                  </MetaRow>
                </div>
              </CardContent>
            </Card>

            {/* Danger zone */}
            <Card className="border-danger/30">
              <CardHeader>
                <CardTitle className="text-danger">{t('common.dangerZone')}</CardTitle>
                <CardDescription>{t('tasks.detail.dangerDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                {deleteError && (
                  <p className="mb-3 flex items-center gap-1.5 text-sm text-danger">
                    <TriangleAlert className="size-4 shrink-0" />
                    {deleteError}
                  </p>
                )}
                {confirming ? (
                  <div className="flex flex-col gap-3 rounded-lg border border-danger/30 bg-danger/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium text-foreground">
                      {t('tasks.detail.confirmDeleteBefore')}{' '}
                      <span className="font-semibold">{task.title}</span>
                      {t('tasks.detail.confirmDeleteAfter')}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirming(false)}
                        disabled={deleting}
                      >
                        {t('common.cancel')}
                      </Button>
                      <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
                        {deleting ? (
                          <>
                            <Loader2 className="animate-spin" />
                            {t('common.deleting')}
                          </>
                        ) : (
                          <>
                            <Trash2 />
                            {t('tasks.detail.deleteButton')}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="danger"
                    size="md"
                    onClick={() => {
                      setDeleteError(null);
                      setConfirming(true);
                    }}
                  >
                    <Trash2 />
                    {t('tasks.detail.deleteButton')}
                  </Button>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="size-12 animate-pulse rounded-xl bg-muted" />
        <div className="space-y-2">
          <div className="h-6 w-56 animate-pulse rounded bg-muted" />
          <div className="h-5 w-40 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-9 w-48 animate-pulse rounded-lg bg-muted" />
          <div className="space-y-3 pt-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

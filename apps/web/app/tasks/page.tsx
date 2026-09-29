'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Bot,
  ChevronRight,
  FolderKanban,
  ListTodo,
  Loader2,
  Plus,
  RefreshCw,
  TriangleAlert,
  X,
} from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  AgentRef,
  PRIORITY_OPTIONS,
  ProjectRef,
  Task,
  TASK_STATUS_ORDER,
  taskPriorityLabel,
  taskPriorityVariant,
  taskStatusLabel,
  taskStatusVariant,
} from './types';

// Shared control styling (mirrors the Input component) minus a fixed height, so
// each <select> can match Input's h-9.
const fieldControl =
  'flex w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-xs ' +
  'transition-colors placeholder:text-muted-foreground ' +
  'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const labelClass = 'block text-sm font-medium text-foreground';

// Solid accent dot per column header, matching each status Badge's hue.
const STATUS_DOT: Record<string, string> = {
  backlog: 'bg-muted-foreground/40',
  ready: 'bg-muted-foreground/60',
  in_progress: 'bg-primary',
  waiting_approval: 'bg-warning',
  completed: 'bg-success',
  failed: 'bg-danger',
};

type FormState = {
  title: string;
  projectId: string;
  assignedAgentId: string;
  priority: string;
};

const EMPTY_FORM: FormState = {
  title: '',
  projectId: '',
  assignedAgentId: '',
  priority: 'medium',
};

export default function TasksPage() {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [projects, setProjects] = React.useState<ProjectRef[]>([]);
  const [agents, setAgents] = React.useState<AgentRef[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tasksData, projectsData, agentsData] = await Promise.all([
        api.get<Task[]>('/tasks'),
        api.get<ProjectRef[]>('/projects'),
        api.get<AgentRef[]>('/agents'),
      ]);
      setTasks(tasksData);
      setProjects(projectsData);
      setAgents(agentsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const projectName = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projects) map.set(project.id, project.name);
    return map;
  }, [projects]);

  const agentName = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const agent of agents) map.set(agent.id, agent.name);
    return map;
  }, [agents]);

  const byStatus = React.useMemo(() => {
    const groups = new Map<string, Task[]>();
    for (const status of TASK_STATUS_ORDER) groups.set(status, []);
    for (const task of tasks) {
      groups.get(task.status)?.push(task);
    }
    return groups;
  }, [tasks]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openForm() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setFormError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) {
      setFormError('Task title is required.');
      return;
    }
    if (!form.projectId) {
      setFormError('Please select a project.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await api.post<Task>('/tasks', {
        title,
        projectId: form.projectId,
        priority: form.priority,
        assignedAgentId: form.assignedAgentId || undefined,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  }

  const hasTasks = tasks.length > 0;
  const noProjects = projects.length === 0;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tasks</h1>
              {!loading && !error && hasTasks && (
                <Badge variant="neutral">{tasks.length}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Track work across your projects — from backlog to done — and assign it to agents.
            </p>
          </div>
          {showForm ? (
            <Button variant="secondary" size="md" onClick={closeForm}>
              <X />
              Cancel
            </Button>
          ) : (
            <Button size="md" onClick={openForm}>
              <Plus />
              New task
            </Button>
          )}
        </div>

        {/* Inline create form */}
        {showForm && (
          <Card className="animate-fade-up">
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                <div className="space-y-1.5">
                  <label htmlFor="task-title" className={labelClass}>
                    Title <span className="text-danger">*</span>
                  </label>
                  <Input
                    id="task-title"
                    required
                    autoFocus
                    placeholder="e.g. Fix flaky checkout test"
                    maxLength={200}
                    value={form.title}
                    onChange={(e) => updateField('title', e.target.value)}
                    disabled={submitting}
                  />
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <label htmlFor="task-project" className={labelClass}>
                      Project <span className="text-danger">*</span>
                    </label>
                    <select
                      id="task-project"
                      required
                      className={cn(fieldControl, 'h-9 py-1')}
                      value={form.projectId}
                      onChange={(e) => updateField('projectId', e.target.value)}
                      disabled={submitting || noProjects}
                    >
                      <option value="" disabled>
                        {noProjects ? 'No projects available' : 'Select a project'}
                      </option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="task-agent" className={labelClass}>
                      Assignee
                    </label>
                    <select
                      id="task-agent"
                      className={cn(fieldControl, 'h-9 py-1')}
                      value={form.assignedAgentId}
                      onChange={(e) => updateField('assignedAgentId', e.target.value)}
                      disabled={submitting}
                    >
                      <option value="">Unassigned</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="task-priority" className={labelClass}>
                      Priority
                    </label>
                    <select
                      id="task-priority"
                      className={cn(fieldControl, 'h-9 py-1')}
                      value={form.priority}
                      onChange={(e) => updateField('priority', e.target.value)}
                      disabled={submitting}
                    >
                      {PRIORITY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {noProjects && (
                  <p className="text-xs text-muted-foreground">
                    You need a project before you can create a task.{' '}
                    <Link href="/projects" className="font-medium text-primary hover:underline">
                      Create one first
                    </Link>
                    .
                  </p>
                )}

                {formError && (
                  <div className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={closeForm}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="md"
                    disabled={submitting || noProjects || !form.title.trim() || !form.projectId}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="animate-spin" />
                        Creating…
                      </>
                    ) : (
                      <>
                        <Plus />
                        Create task
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Content states */}
        {loading ? (
          <BoardSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : !hasTasks ? (
          <EmptyState onCreate={openForm} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            {TASK_STATUS_ORDER.map((status) => {
              const columnTasks = byStatus.get(status) ?? [];
              return (
                <section key={status} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn('size-2 shrink-0 rounded-full', STATUS_DOT[status])}
                        aria-hidden
                      />
                      <h2 className="text-sm font-semibold text-foreground">
                        {taskStatusLabel(status)}
                      </h2>
                    </div>
                    <Badge variant="neutral">{columnTasks.length}</Badge>
                  </div>

                  <div className="flex flex-col gap-3">
                    {columnTasks.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-8 text-center text-xs text-muted-foreground">
                        No tasks
                      </div>
                    ) : (
                      columnTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          projectName={projectName.get(task.projectId)}
                          agentName={
                            task.assignedAgentId
                              ? agentName.get(task.assignedAgentId)
                              : undefined
                          }
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function TaskCard({
  task,
  projectName,
  agentName,
}: {
  task: Task;
  projectName?: string;
  agentName?: string;
}) {
  return (
    <Link
      href={`/tasks/${task.id}`}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="transition-shadow duration-200 hover:shadow-md">
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-sm font-semibold text-foreground">{task.title}</p>
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground/60 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={taskPriorityVariant(task.priority)}>
              {taskPriorityLabel(task.priority)}
            </Badge>
            <Badge variant={taskStatusVariant(task.status)} dot>
              {taskStatusLabel(task.status)}
            </Badge>
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <FolderKanban className="size-3.5 shrink-0" />
              <span className="truncate">{projectName ?? 'Unknown project'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Bot className="size-3.5 shrink-0" />
              <span className="truncate">{agentName ?? 'Unassigned'}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function BoardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {TASK_STATUS_ORDER.map((status) => (
        <div key={status} className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-0.5">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-5 w-6 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="flex flex-col gap-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
                  <div className="flex gap-1.5">
                    <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
                    <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-card text-muted-foreground shadow-xs ring-1 ring-border">
        <ListTodo className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">No tasks yet</p>
        <p className="mx-auto max-w-xs text-sm text-muted-foreground">
          Create your first task to start planning work and delegating it to your agents.
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={onCreate}>
        <Plus />
        New task
      </Button>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-danger/30 bg-danger/5 px-6 py-16 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-card text-danger shadow-xs ring-1 ring-danger/25">
        <TriangleAlert className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Couldn&apos;t load tasks</p>
        <p className="mx-auto max-w-xs text-sm text-muted-foreground">{message}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        <RefreshCw />
        Try again
      </Button>
    </div>
  );
}

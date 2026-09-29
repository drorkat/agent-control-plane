import type { BadgeVariant } from '@/components/ui/badge';

export type TaskStatus =
  | 'backlog'
  | 'ready'
  | 'in_progress'
  | 'waiting_approval'
  | 'completed'
  | 'failed';

export type TaskPriority = 'low' | 'medium' | 'high';

/** Shape returned by the API for a task (dates arrive as ISO strings). */
export interface Task {
  id: string;
  organizationId: string;
  projectId: string;
  assignedAgentId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus | string;
  priority: TaskPriority | string;
  createdAt: string;
  updatedAt: string;
}

/** Minimal project reference used to resolve names in task views. */
export interface ProjectRef {
  id: string;
  name: string;
}

/** Minimal agent reference used to resolve names in task views. */
export interface AgentRef {
  id: string;
  name: string;
}

/** Board column order, left-to-right / top-to-bottom. */
export const TASK_STATUS_ORDER: TaskStatus[] = [
  'backlog',
  'ready',
  'in_progress',
  'waiting_approval',
  'completed',
  'failed',
];

const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  in_progress: 'In Progress',
  waiting_approval: 'Waiting Approval',
  completed: 'Completed',
  failed: 'Failed',
};

/** Human-friendly status name, falling back to the raw value. */
export function taskStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** Map a task status to a design-system Badge variant. */
export function taskStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'completed':
      return 'success';
    case 'in_progress':
      return 'primary';
    case 'waiting_approval':
      return 'warning';
    case 'failed':
      return 'danger';
    case 'ready':
    case 'backlog':
    default:
      return 'neutral';
  }
}

export const TASK_PRIORITY_ORDER: TaskPriority[] = ['low', 'medium', 'high'];

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/** Human-friendly priority name, falling back to the raw value. */
export function taskPriorityLabel(priority: string): string {
  return PRIORITY_LABELS[priority] ?? priority;
}

/** Map a task priority to a design-system Badge variant. */
export function taskPriorityVariant(priority: string): BadgeVariant {
  switch (priority) {
    case 'high':
      return 'danger';
    case 'medium':
      return 'warning';
    case 'low':
    default:
      return 'neutral';
  }
}

export const STATUS_OPTIONS: { value: TaskStatus; label: string }[] =
  TASK_STATUS_ORDER.map((value) => ({ value, label: taskStatusLabel(value) }));

export const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] =
  TASK_PRIORITY_ORDER.map((value) => ({ value, label: taskPriorityLabel(value) }));

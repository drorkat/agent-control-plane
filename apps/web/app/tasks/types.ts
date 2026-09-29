import type { BadgeVariant } from '@/components/ui/badge';
import type { TranslateFn, TranslationKey } from '@/lib/i18n/dictionary';

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

const STATUS_LABEL_KEYS: Record<TaskStatus, TranslationKey> = {
  backlog: 'tasks.status.backlog',
  ready: 'tasks.status.ready',
  in_progress: 'tasks.status.in_progress',
  waiting_approval: 'tasks.status.waiting_approval',
  completed: 'tasks.status.completed',
  failed: 'tasks.status.failed',
};

/** Translated status name, falling back to the raw value for unknown statuses. */
export function taskStatusLabel(status: string, t: TranslateFn): string {
  const key = STATUS_LABEL_KEYS[status as TaskStatus];
  return key ? t(key) : status;
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

const PRIORITY_LABEL_KEYS: Record<TaskPriority, TranslationKey> = {
  low: 'tasks.priority.low',
  medium: 'tasks.priority.medium',
  high: 'tasks.priority.high',
};

/** Translated priority name, falling back to the raw value for unknown priorities. */
export function taskPriorityLabel(priority: string, t: TranslateFn): string {
  const key = PRIORITY_LABEL_KEYS[priority as TaskPriority];
  return key ? t(key) : priority;
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

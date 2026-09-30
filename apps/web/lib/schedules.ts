// Typed client for the schedules endpoints. Mirrors `lib/members.ts` and
// `lib/invitations.ts`: same-origin `/api/*` calls that reuse the shared
// request/error handling from the `api` client.
//
// The server enforces the real authorization (RolesGuard): creating, pausing/
// resuming and deleting a schedule are owner/admin only (a non-manager caller
// gets a 403 that surfaces here as a thrown Error), while listing is open to any
// signed-in member. Callers hide the management UI for non-managers and also
// handle a thrown error gracefully.
import { api } from './api';

/** A recurring, scheduled task run as returned by the schedules endpoints. */
export type Schedule = {
  id: string;
  taskId: string;
  /** Overrides the task's assigned agent when set; `null` uses the task's agent. */
  agentId: string | null;
  /** Optional human label for the schedule. */
  name: string | null;
  intervalMinutes: number;
  active: boolean;
  /** ISO timestamp of the last run, or `null` if it has never run. */
  lastRunAt: string | null;
  /** ISO timestamp of the next scheduled run, or `null` while paused. */
  nextRunAt: string | null;
  createdAt: string;
  /** The scheduled task's title, when the API joins it in. */
  taskTitle?: string | null;
};

/** Payload for creating a schedule (the org is taken from the session). */
export type CreateScheduleInput = {
  taskId: string;
  /** Override the task's assigned agent; omit to use the task's own agent. */
  agentId?: string;
  name?: string;
  intervalMinutes: number;
};

/** List every schedule of the current organization (any signed-in member). */
export function listSchedules(): Promise<Schedule[]> {
  return api.get<Schedule[]>('/schedules');
}

/** Create a schedule (owner/admin only). */
export function createSchedule(input: CreateScheduleInput): Promise<Schedule> {
  return api.post<Schedule>('/schedules', input);
}

/** Pause or resume a schedule (owner/admin only). */
export function setScheduleActive(id: string, active: boolean): Promise<Schedule> {
  return api.patch<Schedule>(`/schedules/${id}`, { active });
}

/** Delete a schedule (owner/admin only). */
export function deleteSchedule(id: string): Promise<void> {
  return api.delete<void>(`/schedules/${id}`);
}

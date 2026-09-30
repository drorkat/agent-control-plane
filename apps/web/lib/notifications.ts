// Typed client for the in-app notifications endpoints. Mirrors the other
// `lib/*.ts` helpers: same-origin `/api/*` calls reusing the shared `api`
// client's request/error handling.
import { api } from './api';

/** An in-app notification as returned by the notifications endpoints. */
export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
};

/** Recent notifications, newest first. */
export function listNotifications(): Promise<AppNotification[]> {
  return api.get<AppNotification[]>('/notifications');
}

/** The number of unread notifications for the current user. */
export function getUnreadCount(): Promise<number> {
  return api
    .get<{ count: number }>('/notifications/unread-count')
    .then((res) => res.count);
}

/** Mark every notification read; resolves to how many rows were updated. */
export function markAllNotificationsRead(): Promise<number> {
  return api
    .post<{ updated: number }>('/notifications/read-all')
    .then((res) => res.updated);
}

/** Mark a single notification read. */
export function markNotificationRead(id: string): Promise<void> {
  return api.post<void>(`/notifications/${id}/read`);
}

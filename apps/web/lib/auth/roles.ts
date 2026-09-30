/**
 * Client-side role helpers, mirroring the server's RolesGuard. These only
 * hide/disable UI affordances for a nicer experience — the API is the real
 * authority and independently enforces the same rules (a hidden button that is
 * somehow called still 403s server-side).
 */

export type Role = 'owner' | 'admin' | 'member' | 'viewer';

/**
 * Owners and admins manage the workspace: resolve approvals, manage provider
 * keys and the GitHub connection, manage the team, and manage webhooks.
 */
export function canManage(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Everyone except viewers can create and run work (projects, agents, tasks,
 * runs). Viewers are read-only.
 */
export function canWrite(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'member';
}

/** Human-facing i18n key for a role value (falls back handled by the caller). */
export function roleLabelKey(role: string): string {
  return `roles.${role}`;
}

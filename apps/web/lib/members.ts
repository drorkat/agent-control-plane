// Typed client for the team/members endpoints. Mirrors the provider-key and
// GitHub helpers in `lib/*.ts`: same-origin `/api/*` calls that reuse the
// shared request/error handling from the `api` client.
//
// The server enforces the real authorization (RolesGuard): these endpoints are
// owner/admin only, so a non-manager caller gets a 403 that surfaces here as a
// thrown Error. Callers hide the management UI for non-managers and also handle
// a thrown error gracefully.
import { api } from './api';
import type { Role } from './auth/roles';

/** A workspace member as returned by the members endpoints. */
export type Member = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  createdAt: string;
};

/**
 * Roles that may be granted to a brand-new member. Unlike an existing member's
 * role (which can be promoted to `owner` via PATCH), a new member cannot be
 * created as an `owner`.
 */
export type AssignableRole = 'admin' | 'member' | 'viewer';

/** Payload for inviting/creating a member (the org is taken from the session). */
export type CreateMemberInput = {
  email: string;
  name?: string;
  /** A temporary password the member can change after their first sign-in. */
  password: string;
  role: AssignableRole;
};

/** List every member of the current organization. */
export function listMembers(): Promise<Member[]> {
  return api.get<Member[]>('/members');
}

/** Invite/create a member with a temporary password. */
export function createMember(input: CreateMemberInput): Promise<Member> {
  return api.post<Member>('/members', input);
}

/** Change an existing member's role (owner/admin/member/viewer). */
export function updateMemberRole(id: string, role: Role): Promise<Member> {
  return api.patch<Member>(`/members/${id}`, { role });
}

/** Remove a member from the organization. */
export function removeMember(id: string): Promise<void> {
  return api.delete<void>(`/members/${id}`);
}

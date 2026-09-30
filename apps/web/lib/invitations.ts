// Typed client for the invitations endpoints. Mirrors `lib/members.ts` and the
// other `lib/*.ts` helpers: same-origin `/api/*` calls that reuse the shared
// request/error handling from the `api` client.
//
// Inviting by link replaces the old temp-password add flow: a manager creates
// an invitation, shares the returned single-use link, and the recipient sets
// their own password on the public accept page. The server enforces the real
// authorization — creating, listing and revoking are owner/admin only (a
// non-manager caller gets a 403 that surfaces here as a thrown Error), while
// looking up and accepting an invitation by its token are public (no session).
import { api } from './api';
import type { Role } from './auth/roles';
import type { AssignableRole } from './members';

/** A pending (or just-created) invitation as returned by the manager endpoints. */
export type Invitation = {
  id: string;
  email: string;
  role: Role;
  /** Single-use token; the shareable link is built from this client-side. */
  token: string;
  expiresAt: string;
  /** Set once the invitation is accepted; `null` while still pending. */
  acceptedAt: string | null;
  createdAt: string;
};

/** Public, recipient-facing details for a valid invitation token. */
export type InvitationInfo = {
  email: string;
  role: Role;
  organizationName: string;
};

/** The account created when an invitation is accepted (the caller is NOT logged in). */
export type AcceptedInvitation = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  organizationId: string;
};

/** Fields the recipient submits to accept an invitation. */
export type AcceptInvitationInput = {
  name?: string;
  password: string;
};

/** List the current organization's pending invitations (owner/admin only). */
export function listInvitations(): Promise<Invitation[]> {
  return api.get<Invitation[]>('/invitations');
}

/** Create an invitation for `email` with the given role (owner/admin only). */
export function createInvitation(email: string, role: AssignableRole): Promise<Invitation> {
  return api.post<Invitation>('/invitations', { email, role });
}

/** Revoke a pending invitation (owner/admin only). */
export function revokeInvitation(id: string): Promise<void> {
  return api.delete<void>(`/invitations/${id}`);
}

/**
 * Public lookup of an invitation by its token. Throws on 404 (unknown token)
 * or 410 (already used / expired); the accept page treats any error as invalid.
 */
export function getInvitationByToken(token: string): Promise<InvitationInfo> {
  return api.get<InvitationInfo>(`/invitations/${encodeURIComponent(token)}`);
}

/**
 * Public accept: creates the member's account from the invitation but does NOT
 * sign them in — the caller should send them to `/login` afterwards.
 */
export function acceptInvitation(
  token: string,
  input: AcceptInvitationInput,
): Promise<AcceptedInvitation> {
  return api.post<AcceptedInvitation>(`/invitations/${encodeURIComponent(token)}/accept`, input);
}

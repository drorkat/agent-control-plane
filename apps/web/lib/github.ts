// Typed client for the GitHub integration endpoints. Mirrors the provider-key
// helpers in `lib/api.ts`: same-origin `/api/*` calls, reusing the shared
// request/error handling from the `api` client.
import { api } from './api';

/**
 * Safe, client-facing shape of a stored GitHub connection. The plaintext token
 * is write-only — the API never returns it, only the retained last 4 chars.
 */
export type GithubConnection = {
  id: string;
  accountLogin: string | null;
  scopes: string | null;
  last4: string | null;
  createdAt: string;
};

/** The current GitHub connection, or `null` when none is connected. */
export function getGithubConnection(): Promise<GithubConnection | null> {
  return api.get<GithubConnection | null>('/github/connection');
}

/** Connect GitHub by storing a personal access token (write-only). */
export function connectGithub(token: string): Promise<GithubConnection> {
  return api.post<GithubConnection>('/github/connection', { token });
}

/** Remove the stored GitHub connection. */
export function disconnectGithub(id: string): Promise<void> {
  return api.delete<void>(`/github/connection/${id}`);
}

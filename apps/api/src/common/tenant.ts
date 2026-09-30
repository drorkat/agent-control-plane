import { AsyncLocalStorage } from 'node:async_hooks';

// Every row carries organizationId. Each authenticated request runs inside a
// tenant context (set by AuthMiddleware from the session); services scope their
// queries to currentOrgId(). Outside a request (e.g. the startup seed) this
// falls back to the default organization.
export const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';
export const DEFAULT_ORG_SLUG = 'default';
export const DEFAULT_ORG_NAME = 'Default Organization';

export interface TenantContext {
  organizationId: string;
  userId?: string;
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();

/** Organization id for the current request; the default org outside a request. */
export function currentOrgId(): string {
  return tenantStorage.getStore()?.organizationId ?? DEFAULT_ORG_ID;
}

/** Authenticated user id for the current request, if any. */
export function currentUserId(): string | undefined {
  return tenantStorage.getStore()?.userId;
}

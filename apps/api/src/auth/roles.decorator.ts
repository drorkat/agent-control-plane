import { SetMetadata } from '@nestjs/common';

/** The roles a user may hold. Mirrors the `role` column on the User model. */
export type Role = 'owner' | 'admin' | 'member' | 'viewer';

/** Metadata key set by {@link Roles} and read by the global RolesGuard. */
export const ROLES_KEY = 'acp_roles';

/**
 * Restrict a route handler (or whole controller) to the given roles. The global
 * RolesGuard reads this metadata and 403s any authenticated user whose role is
 * not listed. Routes without it are unaffected.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

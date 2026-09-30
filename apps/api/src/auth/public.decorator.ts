import { CustomDecorator, SetMetadata } from '@nestjs/common';

/**
 * Metadata key set by {@link Public} and read by the global AuthGuard. A route
 * (or whole controller) marked with it bypasses authentication.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/** Mark a route handler or controller as reachable without a session. */
export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC_KEY, true);

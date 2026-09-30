import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * The authenticated principal attached to the request by AuthMiddleware after a
 * valid session cookie is verified. Absent on anonymous requests.
 */
export interface AuthUser {
  userId: string;
  organizationId: string;
}

/**
 * Inject the current {@link AuthUser} (or `undefined` when the request is
 * anonymous). Reads `req.user`, which AuthMiddleware populates from the session.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    return req.user;
  },
);

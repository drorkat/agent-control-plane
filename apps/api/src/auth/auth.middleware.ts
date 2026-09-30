import { Injectable, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import { tenantStorage } from '../common/tenant';
import { AuthUser } from './current-user.decorator';

/** Shape of the verified JWT payload. */
interface SessionClaims {
  userId: string;
  organizationId: string;
}

/** Express request augmented with the parsed cookies and resolved principal. */
type AuthedRequest = Request & {
  cookies?: Record<string, string>;
  user?: AuthUser;
};

/**
 * Resolves the session on every request. When a valid `acp_session` cookie is
 * present it attaches `req.user` and runs the rest of the request inside a
 * tenant context, so services can scope their queries via currentOrgId(). A
 * missing or invalid token is treated as anonymous — this NEVER throws; the
 * global AuthGuard is what rejects protected routes.
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly jwt: JwtService) {}

  use(req: AuthedRequest, _res: Response, next: NextFunction): void {
    const token = req.cookies?.['acp_session'];
    if (token) {
      try {
        const { userId, organizationId } =
          this.jwt.verify<SessionClaims>(token);
        req.user = { userId, organizationId };
        tenantStorage.run({ organizationId, userId }, () => next());
        return;
      } catch {
        // Invalid/expired token: fall through and continue as anonymous.
      }
    }
    next();
  }
}

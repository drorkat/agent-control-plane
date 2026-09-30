import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { AuthUser } from './current-user.decorator';

/**
 * Global guard (registered as APP_GUARD). Routes or controllers marked
 * {@link Public} pass through; every other route requires a `req.user` resolved
 * by AuthMiddleware, otherwise it 401s.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (req.user) {
      return true;
    }

    throw new UnauthorizedException();
  }
}

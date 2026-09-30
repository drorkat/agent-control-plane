import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { currentUserId } from '../common/tenant';
import { AuthUser } from './current-user.decorator';
import { Role, ROLES_KEY } from './roles.decorator';

/**
 * Global authorization guard (registered as APP_GUARD, after the AuthGuard so
 * authentication runs first). A route (or controller) marked with {@link Roles}
 * is only reachable by a user whose role is listed; a route without it passes
 * through untouched. The request principal carries no role, so the current
 * user's role is loaded fresh from the database on each protected request.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const userId = currentUserId() ?? req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) {
      throw new UnauthorizedException();
    }

    if (requiredRoles.includes(user.role as Role)) {
      return true;
    }
    throw new ForbiddenException('Insufficient role');
  }
}

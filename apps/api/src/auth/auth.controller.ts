import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { AuthUser, CurrentUser } from './current-user.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';

/** Name of the httpOnly session cookie carrying the JWT. */
const SESSION_COOKIE = 'acp_session';
/** Cookie lifetime: 30 days, matching the token's expiry. */
const SESSION_MAX_AGE = 1000 * 60 * 60 * 24 * 30;

// Global prefix `api` (main.ts) puts these routes under /api/auth. Every route
// is @Public so it bypasses the global AuthGuard; /me still resolves the
// session (via AuthMiddleware) and 401s when there isn't one.
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('signup')
  async signup(
    @Body() dto: CreateUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.auth.signup(dto);
    this.setSessionCookie(res, token);
    return user;
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = await this.auth.login(dto);
    this.setSessionCookie(res, token);
    return user;
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Public()
  @Get('me')
  async me(@CurrentUser() current: AuthUser | undefined) {
    const user = current
      ? await this.auth.safeUserById(current.userId)
      : null;
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }

  /** Set the httpOnly session cookie on the response. */
  private setSessionCookie(res: Response, token: string): void {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      // Marked Secure in production (and whenever COOKIE_SECURE=1) so the session
      // cookie is never sent over plain HTTP. Left off in local dev over http.
      secure:
        process.env.COOKIE_SECURE === '1' ||
        process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });
  }
}

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthMiddleware } from './auth.middleware';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';

// PrismaService is provided by the @Global() PrismaModule, so it does not need
// to be imported here. The manager registers this module in app.module.ts.
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.AUTH_SECRET || 'dev-secret-change-me',
      signOptions: { expiresIn: '30d' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthMiddleware,
    // APP_GUARDs run in registration order, so authentication (AuthGuard) runs
    // before authorization (RolesGuard).
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService],
})
export class AuthModule implements NestModule {
  // Resolve the session for every request. Applied here (not globally in
  // main.ts) so the middleware can inject JwtService.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes('*');
  }
}

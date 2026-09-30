import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { ProjectsModule } from './projects/projects.module';
import { AgentsModule } from './agents/agents.module';
import { TasksModule } from './tasks/tasks.module';
import { ProvidersModule } from './providers/providers.module';
import { AiModule } from './ai/ai.module';
import { RunsModule } from './runs/runs.module';
import { GatewayModule } from './gateway/gateway.module';
import { AuditModule } from './audit/audit.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { GitHubModule } from './github/github.module';
import { MembersModule } from './members/members.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { NotificationsModule } from './notifications/notifications.module';
import { InvitationsModule } from './invitations/invitations.module';
import { SchedulesModule } from './schedules/schedules.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    // Global rate limit: 300 requests / 60s per client IP. Auth routes tighten
    // this further (see AuthController's @Throttle). In-memory storage is per
    // instance — a multi-instance deployment should back this with a shared
    // store (e.g. Redis via @nestjs/throttler's storage adapter).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    CommonModule,
    AuthModule,
    ProjectsModule,
    AgentsModule,
    TasksModule,
    ProvidersModule,
    GatewayModule,
    AuditModule,
    AiModule,
    GitHubModule,
    RunsModule,
    ApprovalsModule,
    DashboardModule,
    MembersModule,
    WebhooksModule,
    NotificationsModule,
    InvitationsModule,
    SchedulesModule,
  ],
  controllers: [HealthController],
  providers: [
    // Apply the rate limiter globally. Registered here as an APP_GUARD; it runs
    // alongside the Auth/Roles guards (AuthModule) and protects public routes
    // like login/signup from brute force even before authentication.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

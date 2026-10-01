import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { MetricsModule } from './metrics/metrics.module';
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
    // Structured JSON logging with a per-request correlation id. Sensitive
    // headers are never serialized (see serializers), and health/metrics polling
    // is not logged so the output stays signal. Level via LOG_LEVEL (default info).
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        autoLogging: {
          ignore: (req) => {
            const url = req.url ?? '';
            return url.includes('/health') || url.includes('/metrics');
          },
        },
        // Log only safe request/response fields — never cookies, auth headers,
        // or set-cookie — so credentials can't leak into logs.
        serializers: {
          req: (req) => ({ id: req.id, method: req.method, url: req.url }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
        redact: {
          paths: [
            'req.headers.cookie',
            'req.headers.authorization',
            'res.headers["set-cookie"]',
          ],
          remove: true,
        },
      },
    }),
    // Global rate limit: 300 requests / 60s per client IP. Auth routes tighten
    // this further (see AuthController's @Throttle). Storage is in-memory by
    // default (fine for a single instance); set REDIS_URL to share one limit
    // across N instances. On a Redis outage the limiter fails closed, so point
    // it at a reliable Redis.
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const throttlers = [{ ttl: 60_000, limit: 300 }];
        const url = process.env.REDIS_URL;
        if (!url) {
          return { throttlers };
        }
        const client = new Redis(url);
        // Never let a Redis hiccup crash the process; ioredis retries on its own.
        client.on('error', (err) => {
          // eslint-disable-next-line no-console
          console.error(`Throttler Redis error: ${err.message}`);
        });
        return {
          throttlers,
          storage: new ThrottlerStorageRedisService(client),
        };
      },
    }),
    MetricsModule,
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

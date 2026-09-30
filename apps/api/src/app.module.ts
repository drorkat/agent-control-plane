import { Module } from '@nestjs/common';
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
import { HealthController } from './health/health.controller';

@Module({
  imports: [
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
  ],
  controllers: [HealthController],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { ProjectsModule } from './projects/projects.module';
import { AgentsModule } from './agents/agents.module';
import { TasksModule } from './tasks/tasks.module';
import { ProvidersModule } from './providers/providers.module';
import { AiModule } from './ai/ai.module';
import { RunsModule } from './runs/runs.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    ProjectsModule,
    AgentsModule,
    TasksModule,
    ProvidersModule,
    AiModule,
    RunsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

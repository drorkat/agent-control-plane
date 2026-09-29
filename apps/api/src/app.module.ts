import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { ProjectsModule } from './projects/projects.module';
import { AgentsModule } from './agents/agents.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [PrismaModule, CommonModule, ProjectsModule, AgentsModule],
  controllers: [HealthController],
})
export class AppModule {}

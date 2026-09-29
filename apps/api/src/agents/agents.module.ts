import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

// PrismaModule is @Global, so PrismaService is available without importing it.
// The manager must register this module in app.module.ts.
@Module({
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}

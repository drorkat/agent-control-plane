import { Module } from '@nestjs/common';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { RunsModule } from '../runs/runs.module';

// Imports RunsModule to inject RunsService (to resume a paused run). Prisma
// service and AuditService come from their @Global modules. The manager
// registers ApprovalsModule in app.module.ts.
@Module({
  imports: [RunsModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
})
export class ApprovalsModule {}

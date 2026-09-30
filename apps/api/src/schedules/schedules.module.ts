import { Module } from '@nestjs/common';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { SchedulerService } from './scheduler.service';
import { RunsModule } from '../runs/runs.module';

// RunsModule is imported so SchedulerService can inject RunsService to start
// scheduled runs. PrismaService is provided by the @Global() PrismaModule, so it
// is not imported here. SchedulesService is exported for reuse. The manager
// registers this module in app.module.ts.
@Module({
  imports: [RunsModule],
  controllers: [SchedulesController],
  providers: [SchedulesService, SchedulerService],
  exports: [SchedulesService],
})
export class SchedulesModule {}

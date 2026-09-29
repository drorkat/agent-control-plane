import { Module } from '@nestjs/common';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';
import { AiModule } from '../ai/ai.module';

// PrismaService is provided by the @Global() PrismaModule, so it does not need
// to be imported here. The manager registers this module in app.module.ts.
@Module({
  imports: [AiModule],
  controllers: [RunsController],
  providers: [RunsService],
  exports: [RunsService],
})
export class RunsModule {}

import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

// PrismaService is provided by the @Global() PrismaModule, so it does not need
// to be imported here. The manager registers this module in app.module.ts.
@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}

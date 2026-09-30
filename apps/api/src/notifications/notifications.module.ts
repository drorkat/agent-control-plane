import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

// PrismaService is provided by the @Global() PrismaModule, so it does not need
// to be imported here. NotificationsService is exported so the run engine and
// approvals can inject it to raise in-app notifications. The manager registers
// this module in app.module.ts.
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

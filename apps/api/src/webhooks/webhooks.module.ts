import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookDispatcher } from './webhook-dispatcher.service';

// PrismaService is provided by the @Global() PrismaModule, so it does not need
// to be imported here. WebhookDispatcher is exported so the run engine and
// approvals can inject it to emit events. The manager registers this module in
// app.module.ts.
@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookDispatcher],
  exports: [WebhookDispatcher],
})
export class WebhooksModule {}

import { Module } from '@nestjs/common';
import { GatewayService } from './gateway.service';

// GatewayService is a pure, stateless policy evaluator. RunsModule imports this
// module to inject it. The manager registers GatewayModule in app.module.ts.
@Module({
  providers: [GatewayService],
  exports: [GatewayService],
})
export class GatewayModule {}

import { Module } from '@nestjs/common';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';

// PrismaService is provided by the @Global() PrismaModule, so it does not need
// to be imported here. The manager registers this module in app.module.ts.
@Module({
  controllers: [ProvidersController],
  providers: [ProvidersService],
  exports: [ProvidersService],
})
export class ProvidersModule {}

import { Module } from '@nestjs/common';
import { ProviderFactory } from './provider.factory';

/**
 * Provides the run engine's provider layer. PrismaService is supplied by the
 * @Global() PrismaModule, so it does not need to be imported here. The manager
 * registers this module (and RunsModule) in app.module.ts.
 */
@Module({
  providers: [ProviderFactory],
  exports: [ProviderFactory],
})
export class AiModule {}

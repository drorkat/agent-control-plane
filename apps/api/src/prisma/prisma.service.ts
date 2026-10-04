import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { applyRlsExtension, isRlsEnabled } from './rls-extension';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();
    // Opt-in runtime RLS enforcement (DB_RLS=1): return the GUC-setting extended
    // client as this service. The extension proxies the base client's lifecycle
    // ($connect/$disconnect) and model delegates, and scopes every operation to
    // the current org. Off by default, so standard deployments are unchanged.
    if (isRlsEnabled()) {
      return applyRlsExtension(this) as unknown as PrismaService;
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

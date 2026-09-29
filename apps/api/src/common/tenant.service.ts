import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_ORG_ID, DEFAULT_ORG_NAME, DEFAULT_ORG_SLUG } from './tenant';

/**
 * Ensures the single default organization exists on startup. The MVP runs
 * single-tenant; every entity is scoped to DEFAULT_ORG_ID.
 */
@Injectable()
export class TenantService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.prisma.organization.upsert({
      where: { id: DEFAULT_ORG_ID },
      update: {},
      create: {
        id: DEFAULT_ORG_ID,
        name: DEFAULT_ORG_NAME,
        slug: DEFAULT_ORG_SLUG,
      },
    });
  }
}

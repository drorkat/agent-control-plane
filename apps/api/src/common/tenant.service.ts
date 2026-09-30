import { Injectable, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_ORG_ID, DEFAULT_ORG_NAME, DEFAULT_ORG_SLUG } from './tenant';

/**
 * Ensures the single default organization and a default owner user exist on
 * startup. The pre-existing demo data is all under DEFAULT_ORG_ID; seeding an
 * owner makes it reachable by logging in with real credentials. Runs outside a
 * request, so it intentionally uses the DEFAULT_ORG_ID constant (not
 * currentOrgId()).
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

    // Upsert a default owner for the demo org. passwordHash is only set on
    // create (update is a no-op), so re-running startup never clobbers a
    // password the operator has since changed.
    const email = process.env.DEFAULT_USER_EMAIL || 'admin@acp.local';
    const passwordHash = await bcrypt.hash(
      process.env.DEFAULT_USER_PASSWORD || 'admin1234',
      10,
    );
    await this.prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        organizationId: DEFAULT_ORG_ID,
        email,
        name: 'Admin',
        role: 'owner',
        passwordHash,
      },
    });
  }
}

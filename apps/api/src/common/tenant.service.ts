import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
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
  private readonly logger = new Logger(TenantService.name);

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

    // Seed a default owner for the demo org, but only if that account does not
    // already exist — so re-running startup never re-hashes or clobbers a
    // password the operator has since changed.
    const email = process.env.DEFAULT_USER_EMAIL || 'admin@acp.local';
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) return;

    const usingDefaultPassword = !process.env.DEFAULT_USER_PASSWORD;
    const passwordHash = await bcrypt.hash(
      process.env.DEFAULT_USER_PASSWORD || 'admin1234',
      10,
    );
    await this.prisma.user.create({
      data: {
        organizationId: DEFAULT_ORG_ID,
        email,
        name: 'Admin',
        role: 'owner',
        passwordHash,
      },
    });

    // Loudly warn when the built-in default password is in effect for a
    // freshly seeded owner: an unattended deployment left on admin1234 is a
    // trivial account takeover. Only fires on the boot that actually created
    // the owner — never nags an operator who has since changed it.
    if (usingDefaultPassword) {
      this.logger.warn(
        `Seeded default owner "${email}" with the built-in password ` +
          `"admin1234". Change it immediately (or set DEFAULT_USER_PASSWORD ` +
          `before first boot). Leaving it is an open door.`,
      );
    }
  }
}

import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { runInManagedTx, runUnscoped, setTenantGuc } from '../prisma/rls-extension';

/**
 * Client-safe projection of a user. It deliberately omits `passwordHash` (and
 * anything else sensitive) — no credential material ever leaves the API.
 */
export interface SafeUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  organizationId: string;
}

interface SignupInput {
  email: string;
  password: string;
  name?: string;
  organizationName?: string;
}

interface LoginInput {
  email: string;
  password: string;
}

/** Fields loaded from a User row to build a {@link SafeUser}. */
interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  role: string;
  organizationId: string;
  passwordHash: string;
}

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Register a new account: creates an Organization and its owner User in one
   * transactional write, then returns the safe user plus a signed session token.
   * Throws ConflictException if the email is already taken.
   */
  async signup(
    input: SignupInput,
  ): Promise<{ user: SafeUser; token: string }> {
    const email = input.email.trim().toLowerCase();

    // Email uniqueness is global; this pre-check must see every org even under
    // RLS enforcement (signup has no org context yet).
    const existing = await runUnscoped(this.prisma, (tx) =>
      tx.user.findUnique({ where: { email } }),
    );
    if (existing) {
      throw new ConflictException('An account with that email already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const name = input.name?.trim() || null;
    const organizationName =
      input.organizationName?.trim() || `${name || email}'s workspace`;
    const slug = await this.uniqueSlug(organizationName);

    // Create the org, then its owner — atomically. Under RLS enforcement the
    // owner User insert must carry a GUC equal to its (brand-new) org, which is
    // only known after the org row exists; so we create the org first, set the
    // GUC to it, then create the user. Organizations are not RLS-scoped, so the
    // first insert is unaffected. With enforcement off this is just a normal
    // transaction. (currentOrgId() is the default org during unauthenticated
    // signup, which is why the nested create would otherwise fail WITH CHECK.)
    const user = await runInManagedTx(this.prisma, async (tx) => {
      const organization = await tx.organization.create({
        data: { name: organizationName, slug },
      });
      await setTenantGuc(tx, organization.id);
      return tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          role: 'owner',
          organizationId: organization.id,
        },
      });
    });

    return {
      user: this.safeUser(user),
      token: this.sign(user.id, user.organizationId),
    };
  }

  /**
   * Authenticate by email + password. Uses a single, uniform error for both an
   * unknown email and a wrong password so the endpoint doesn't reveal which
   * accounts exist.
   */
  async login(input: LoginInput): Promise<{ user: SafeUser; token: string }> {
    const email = input.email.trim().toLowerCase();
    // Authentication precedes any org context, and the user may belong to any
    // org, so resolve them unscoped (by their globally-unique email). RLS still
    // governs every scoped query the request makes once the org is established.
    const user = await runUnscoped(this.prisma, (tx) =>
      tx.user.findUnique({ where: { email } }),
    );
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return {
      user: this.safeUser(user),
      token: this.sign(user.id, user.organizationId),
    };
  }

  /** Load the safe view of a user by id, or `null` if it no longer exists. */
  async safeUserById(id: string): Promise<SafeUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? this.safeUser(user) : null;
  }

  /** Strip a user record down to the fields that are safe to return. */
  safeUser(user: UserRecord): SafeUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
    };
  }

  /** Sign a 30-day session token carrying the tenant + user identity. */
  private sign(userId: string, organizationId: string): string {
    return this.jwt.sign({ userId, organizationId });
  }

  /** Slugify a name to lowercase, hyphen-separated ASCII (never empty). */
  private slugify(value: string): string {
    const base = value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return base || 'workspace';
  }

  /**
   * Build a unique org slug: the slugified name plus 6 random hex chars, retried
   * on the (astronomically unlikely) collision against the unique `slug` column.
   */
  private async uniqueSlug(name: string): Promise<string> {
    const base = this.slugify(name);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = `${base}-${randomBytes(3).toString('hex')}`;
      const clash = await this.prisma.organization.findUnique({
        where: { slug },
      });
      if (!clash) {
        return slug;
      }
    }
    return `${base}-${randomBytes(6).toString('hex')}`;
  }
}

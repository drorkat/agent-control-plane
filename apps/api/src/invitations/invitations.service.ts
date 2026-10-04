import {
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { currentOrgId } from '../common/tenant';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';

/**
 * Admin-facing view of an invitation. The `token` is included on purpose so an
 * admin can re-copy the invite link; no credential material is ever involved
 * here (the invitee's password is only set, and hashed, at acceptance time).
 */
export interface SafeInvitation {
  id: string;
  email: string;
  role: string;
  token: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

/**
 * The public preview of an invitation, shown on the accept page before the
 * invitee has an account. Deliberately minimal — no token echo, no ids.
 */
export interface InvitationPreview {
  email: string;
  role: string;
  organizationName: string;
}

/**
 * Client-safe projection of the user created on acceptance. Mirrors auth's
 * SafeUser: it omits `passwordHash` so no credential material ever leaves here.
 */
export interface SafeUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  organizationId: string;
}

/**
 * The exact set of safe columns to load/return for an invitation. Only the
 * fields in {@link SafeInvitation} are ever selected.
 */
const SAFE_SELECT = {
  id: true,
  email: true,
  role: true,
  token: true,
  expiresAt: true,
  acceptedAt: true,
  createdAt: true,
} as const;

/** How long an invitation stays valid after it is issued. */
const INVITE_TTL_DAYS = 7;

const BCRYPT_ROUNDS = 10;

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  /**
   * Issue an invitation for the current org. The email is normalized and rejected
   * if it already has an account. Any prior *un-accepted* invitation for the same
   * (org, email) is dropped first so there is only ever one active link. A random
   * token is generated and returned in the safe view so the admin can share it.
   */
  async create(
    dto: CreateInvitationDto,
    invitedByUserId?: string,
  ): Promise<SafeInvitation> {
    const email = dto.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('That email already has an account');
    }

    const organizationId = currentOrgId();

    // Keep a single active invitation per (org, email): drop any earlier pending
    // one so re-inviting supersedes it rather than leaving two valid links.
    // Accepted invitations are left as historical records.
    await this.prisma.invitation.deleteMany({
      where: { organizationId, email, acceptedAt: null },
    });

    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(
      Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const invitation = await this.prisma.invitation.create({
      data: {
        organizationId,
        email,
        role: dto.role,
        token,
        invitedByUserId: invitedByUserId ?? null,
        expiresAt,
      },
      select: SAFE_SELECT,
    });

    // Email the invitee their accept link. Best-effort: a mail failure must not
    // fail the invite — the link is still returned here and shown in the UI.
    await this.sendInviteEmail(invitation, organizationId);

    return invitation;
  }

  /** The web origin the accept link points at (operator-configured; dev default). */
  private inviteBaseUrl(): string {
    const explicit = process.env.APP_BASE_URL?.trim();
    if (explicit) {
      return explicit.replace(/\/+$/, '');
    }
    const webOrigin = (process.env.WEB_ORIGIN ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)[0];
    return (webOrigin ?? 'http://localhost:3000').replace(/\/+$/, '');
  }

  /**
   * Send the invitation email (best-effort; wrapped so nothing here can break the
   * surrounding invite creation). The accept link carries the raw token, which is
   * the invitation's only credential — exactly what the admin would otherwise
   * copy by hand.
   */
  private async sendInviteEmail(
    invitation: SafeInvitation,
    organizationId: string,
  ): Promise<void> {
    try {
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
      });
      const orgName = organization?.name ?? 'your team';
      const url = `${this.inviteBaseUrl()}/accept-invite?token=${invitation.token}`;
      await this.mailer.send({
        to: invitation.email,
        subject: `You're invited to ${orgName} on Agent Control Plane`,
        text:
          `You have been invited to join ${orgName} on Agent Control Plane ` +
          `with the role "${invitation.role}".\n\n` +
          `Accept your invitation:\n${url}\n\n` +
          `This link expires on ${invitation.expiresAt.toUTCString()}. ` +
          `If you were not expecting this, you can ignore this email.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Could not send invite email to ${invitation.email}: ${message}`,
      );
    }
  }

  /**
   * List the current org's still-usable invitations (not yet accepted and not
   * expired), newest first. Only the safe columns are selected.
   */
  findAllPending(): Promise<SafeInvitation[]> {
    return this.prisma.invitation.findMany({
      where: {
        organizationId: currentOrgId(),
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: SAFE_SELECT,
    });
  }

  /**
   * Revoke an invitation, scoped to the current org. The `findFirst` acts as an
   * ownership guard: an invitation in another org (or a bad id) yields a 404
   * instead of a cross-tenant delete.
   */
  async revoke(id: string): Promise<void> {
    const existing = await this.prisma.invitation.findFirst({
      where: { id, organizationId: currentOrgId() },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Invitation ${id} not found`);
    }
    await this.prisma.invitation.delete({ where: { id } });
  }

  /**
   * Public preview of an invitation by its token (no org context — the invitee is
   * not yet a member). Returns the email, role, and org name so the accept page
   * can show who and where the invite is for. Missing/used/expired tokens are
   * rejected exactly as {@link accept} rejects them.
   */
  async getByToken(token: string): Promise<InvitationPreview> {
    const invitation = await this.loadUsableInvitation(token);
    const organization = await this.prisma.organization.findUnique({
      where: { id: invitation.organizationId },
      select: { name: true },
    });
    return {
      email: invitation.email,
      role: invitation.role,
      // The org is guaranteed to exist by the FK; the fallback is defensive only.
      organizationName: organization?.name ?? '',
    };
  }

  /**
   * Accept an invitation (public): create the invitee's account in the invitation's
   * org with its role and a bcrypt-hashed password, and mark the invitation used —
   * both in one transaction. Does not auto-login: the safe user is returned (never
   * the password hash) and the frontend sends them to the login page.
   */
  async accept(token: string, dto: AcceptInvitationDto): Promise<SafeUser> {
    const invitation = await this.loadUsableInvitation(token);

    // The email may have been claimed between issuing and accepting.
    const existingUser = await this.prisma.user.findUnique({
      where: { email: invitation.email },
    });
    if (existingUser) {
      throw new ConflictException('That email already has an account');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const name = dto.name?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          organizationId: invitation.organizationId,
          email: invitation.email,
          name,
          passwordHash,
          role: invitation.role,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          organizationId: true,
        },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      return user;
    });
  }

  /**
   * Load an invitation by token and enforce that it is still usable, with a
   * distinct status for each failure: 404 when unknown, 410 (Gone) when already
   * used or expired. Shared by {@link getByToken} and {@link accept} so both
   * validate identically.
   */
  private async loadUsableInvitation(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.acceptedAt) {
      throw new GoneException('This invitation has already been used');
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new GoneException('This invitation has expired');
    }
    return invitation;
  }
}

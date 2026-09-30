import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { currentOrgId, currentUserId } from '../common/tenant';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

/**
 * Client-safe view of a member. It deliberately omits `passwordHash` (and
 * anything else sensitive) — no credential material ever leaves the API.
 */
export interface SafeMember {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: Date;
}

/**
 * The exact set of safe columns to load/return for a member. Because this is a
 * Prisma `select`, `passwordHash` is never even read into memory here, which
 * makes accidentally leaking it impossible.
 */
const SAFE_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
} as const;

const BCRYPT_ROUNDS = 10;

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List the members of the current org, newest first. Only the safe columns
   * are selected, so the password hash never leaves the database here.
   */
  findAll(): Promise<SafeMember[]> {
    return this.prisma.user.findMany({
      where: { organizationId: currentOrgId() },
      orderBy: { createdAt: 'desc' },
      select: SAFE_SELECT,
    });
  }

  /**
   * Create a member in the current org. The email is normalized and checked for
   * uniqueness, the password is hashed with bcrypt before it is written, and
   * only the safe view is returned — the hash is never echoed back.
   */
  async create(dto: CreateMemberDto): Promise<SafeMember> {
    // Creating an owner is an owner-only action too — otherwise an admin could
    // mint a fresh owner account and bypass the guard on updateRole().
    if (dto.role === 'owner') {
      await this.assertActorIsOwner();
    }

    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with that email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    return this.prisma.user.create({
      data: {
        organizationId: currentOrgId(),
        email,
        name: dto.name?.trim() || null,
        passwordHash,
        role: dto.role,
      },
      select: SAFE_SELECT,
    });
  }

  /**
   * Change a member's role, scoped to the current org. The `findFirst` acts as
   * an ownership guard: a user in another org (or a bad id) yields a 404 instead
   * of a cross-tenant write. Demoting the org's last owner is refused so the org
   * is never left without one.
   */
  async updateRole(id: string, dto: UpdateMemberDto): Promise<SafeMember> {
    const existing = await this.prisma.user.findFirst({
      where: { id, organizationId: currentOrgId() },
      select: { id: true, role: true },
    });
    if (!existing) {
      throw new NotFoundException(`Member ${id} not found`);
    }

    // Granting or changing the owner role is an owner-only action (an admin must
    // not be able to promote anyone — including themselves — to owner).
    if (dto.role === 'owner' || existing.role === 'owner') {
      await this.assertActorIsOwner();
    }

    if (existing.role === 'owner' && dto.role !== 'owner') {
      await this.assertNotLastOwner();
    }

    return this.prisma.user.update({
      where: { id },
      data: { role: dto.role },
      select: SAFE_SELECT,
    });
  }

  /**
   * Remove a member, scoped to the current org. You cannot remove yourself, and
   * the org's last owner cannot be removed — either would lock the org out or
   * leave it ownerless.
   */
  async remove(id: string): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: { id, organizationId: currentOrgId() },
      select: { id: true, role: true },
    });
    if (!existing) {
      throw new NotFoundException(`Member ${id} not found`);
    }

    if (currentUserId() === id) {
      throw new BadRequestException('You cannot remove yourself');
    }

    if (existing.role === 'owner') {
      // Removing an owner is an owner-only action, and never the last one.
      await this.assertActorIsOwner();
      await this.assertNotLastOwner();
    }

    await this.prisma.user.delete({ where: { id } });
  }

  /**
   * Guard an owner-only action: the current user must themselves be an owner of
   * this org. Blocks an admin from granting/removing the owner role.
   */
  private async assertActorIsOwner(): Promise<void> {
    const actorId = currentUserId();
    const actor = actorId
      ? await this.prisma.user.findFirst({
          where: { id: actorId, organizationId: currentOrgId() },
          select: { role: true },
        })
      : null;
    if (!actor || actor.role !== 'owner') {
      throw new ForbiddenException(
        'Only an owner can grant or change the owner role',
      );
    }
  }

  /**
   * Guard against leaving the current org with zero owners: throws when exactly
   * one owner remains.
   */
  private async assertNotLastOwner(): Promise<void> {
    const owners = await this.prisma.user.count({
      where: { organizationId: currentOrgId(), role: 'owner' },
    });
    if (owners <= 1) {
      throw new BadRequestException(
        'An organization must have at least one owner',
      );
    }
  }
}

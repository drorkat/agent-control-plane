import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { currentOrgId } from '../common/tenant';
import { PaginationQuery, paginationArgs } from '../common/pagination';

/**
 * Input to {@link AuditService.record}. `metadata` must contain only safe,
 * non-secret data — never key material or decrypted credentials.
 */
export interface AuditRecordInput {
  actorType: string; // user | agent | system
  actorId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Append-only audit trail. Every governance-relevant event (a policy block, an
 * approval request/decision, a tool execution) is recorded here so the org has
 * a durable, queryable history of who did what.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Write a single audit entry for the default org. */
  record(input: AuditRecordInput) {
    return this.prisma.auditLog.create({
      data: {
        organizationId: currentOrgId(),
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        action: input.action,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      },
    });
  }

  /** A page of audit entries for the default org, newest first. */
  findAll(query: PaginationQuery = {}) {
    return this.prisma.auditLog.findMany({
      where: { organizationId: currentOrgId() },
      orderBy: { createdAt: 'desc' },
      ...paginationArgs(query),
    });
  }
}

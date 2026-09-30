import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { currentOrgId } from '../common/tenant';
import { encryptSecret, last4 } from '../common/crypto';
import { CreateProviderDto } from './dto/create-provider.dto';

/**
 * Safe, client-facing view of a provider credential. It deliberately omits
 * every secret field (`ciphertext`, `iv`, `authTag`) and, of course, the
 * plaintext key — no key material ever leaves the API.
 */
export interface ProviderCredentialView {
  id: string;
  provider: string;
  label: string | null;
  last4: string | null;
  createdAt: Date;
}

/**
 * The exact set of safe columns to load/return for a credential. Because this
 * is a Prisma `select`, the encrypted fields are never even read into memory in
 * this service, which makes accidentally leaking them impossible.
 */
const SAFE_SELECT = {
  id: true,
  provider: true,
  label: true,
  last4: true,
  createdAt: true,
} as const;

/**
 * Trim a free-text field and collapse an empty/whitespace-only value to `null`
 * so the optional `label` column stays clean.
 */
function normalizeOptional(value: string | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List provider credentials for the default org, newest first. Only the safe
   * columns are selected, so encrypted material never leaves the database here.
   */
  findAll(): Promise<ProviderCredentialView[]> {
    return this.prisma.providerCredential.findMany({
      where: { organizationId: currentOrgId() },
      orderBy: { createdAt: 'desc' },
      select: SAFE_SELECT,
    });
  }

  /**
   * Encrypt and store a new provider key. The plaintext is encrypted with
   * AES-256-GCM (see `common/crypto`) before it is written, and only the safe
   * view is returned — the key is never stored in the clear or echoed back.
   */
  create(dto: CreateProviderDto): Promise<ProviderCredentialView> {
    const { ciphertext, iv, authTag } = encryptSecret(dto.apiKey);

    return this.prisma.providerCredential.create({
      data: {
        organizationId: currentOrgId(),
        provider: dto.provider,
        label: normalizeOptional(dto.label),
        ciphertext,
        iv,
        authTag,
        last4: last4(dto.apiKey),
      },
      select: SAFE_SELECT,
    });
  }

  /**
   * Delete a credential, scoped to the default org. The `findFirst` acts as an
   * ownership guard: a row belonging to another org (or a bad id) yields a 404
   * instead of a cross-tenant delete.
   */
  async remove(id: string): Promise<void> {
    const existing = await this.prisma.providerCredential.findFirst({
      where: { id, organizationId: currentOrgId() },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Provider credential ${id} not found`);
    }
    await this.prisma.providerCredential.delete({ where: { id } });
  }
}

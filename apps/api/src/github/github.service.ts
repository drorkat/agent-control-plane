import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { currentOrgId } from '../common/tenant';
import { encryptSecret, last4 } from '../common/crypto';
import { GitHubClientFactory } from './github-client.factory';
import { VerifyResult } from './github-client.interface';
import { ConnectGithubDto } from './dto/connect-github.dto';

/**
 * Safe, client-facing view of a GitHub connection. It deliberately omits every
 * secret field (`ciphertext`, `iv`, `authTag`) and, of course, the plaintext
 * token — no token material ever leaves the API.
 */
export interface GitHubConnectionView {
  id: string;
  accountLogin: string | null;
  scopes: string | null;
  last4: string | null;
  createdAt: Date;
}

/**
 * The exact set of safe columns to load/return for a connection. Because this
 * is a Prisma `select`, the encrypted fields are never even read into memory in
 * this service, which makes accidentally leaking them impossible.
 */
const SAFE_SELECT = {
  id: true,
  accountLogin: true,
  scopes: true,
  last4: true,
  createdAt: true,
} as const;

@Injectable()
export class GitHubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly factory: GitHubClientFactory,
  ) {}

  /**
   * The current org's GitHub connection (newest wins), or `null` when the org
   * has not connected GitHub. Only the safe columns are selected, so encrypted
   * material never leaves the database here.
   */
  getConnection(): Promise<GitHubConnectionView | null> {
    return this.prisma.gitHubConnection.findFirst({
      where: { organizationId: currentOrgId() },
      orderBy: { createdAt: 'desc' },
      select: SAFE_SELECT,
    });
  }

  /**
   * Verify a Personal Access Token, then encrypt and store it. The token is
   * checked against GitHub first (a failure surfaces as a 400); it is encrypted
   * with AES-256-GCM before it is written and only the safe view is returned —
   * the token is never stored in the clear or echoed back. To keep a single
   * active connection per org, any prior connection is removed first.
   */
  async connect(dto: ConnectGithubDto): Promise<GitHubConnectionView> {
    const info = await this.verify(dto.token);

    const { ciphertext, iv, authTag } = encryptSecret(dto.token);

    // Single active connection per org: drop any existing one before creating.
    await this.prisma.gitHubConnection.deleteMany({
      where: { organizationId: currentOrgId() },
    });

    return this.prisma.gitHubConnection.create({
      data: {
        organizationId: currentOrgId(),
        accountLogin: info.login,
        scopes: info.scopes ?? null,
        ciphertext,
        iv,
        authTag,
        last4: last4(dto.token),
      },
      select: SAFE_SELECT,
    });
  }

  /**
   * Delete a connection, scoped to the current org. The `findFirst` acts as an
   * ownership guard: a row belonging to another org (or a bad id) yields a 404
   * instead of a cross-tenant delete.
   */
  async disconnect(id: string): Promise<void> {
    const existing = await this.prisma.gitHubConnection.findFirst({
      where: { id, organizationId: currentOrgId() },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`GitHub connection ${id} not found`);
    }
    await this.prisma.gitHubConnection.delete({ where: { id } });
  }

  /**
   * Verify the token against GitHub, translating any verification failure into a
   * 400 so we never store a token we could not authenticate with.
   */
  private async verify(token: string): Promise<VerifyResult> {
    try {
      return await this.factory.clientForToken(token).verifyToken();
    } catch {
      throw new BadRequestException('Could not verify GitHub token');
    }
  }
}

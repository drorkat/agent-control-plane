import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { currentOrgId } from '../common/tenant';
import { decryptSecret } from '../common/crypto';
import { GitHubClient } from './github-client.interface';
import { MockGitHubClient } from './mock-github.client';
import { RealGitHubClient } from './real-github.client';

/**
 * Builds the GitHubClient the code loop uses. Mirrors the AI ProviderFactory:
 * GITHUB_MOCK=1 short-circuits to a network-free mock before any credential is
 * read, and the real path decrypts the stored token only inside a local scope.
 */
@Injectable()
export class GitHubClientFactory {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build a client from a raw token. Used at connect time to verify a token the
   * user just submitted, before it is encrypted and stored.
   */
  clientForToken(token: string): GitHubClient {
    if (process.env.GITHUB_MOCK === '1') {
      return new MockGitHubClient();
    }
    return new RealGitHubClient(token);
  }

  /**
   * Build the client for the current org's stored connection, or `null` when no
   * connection exists.
   *
   * SECURITY: the token is decrypted here and handed straight to the adapter.
   * The plaintext token never leaves this method — it is never logged, returned,
   * or written to a RunEvent payload.
   */
  async forCurrentOrg(): Promise<GitHubClient | null> {
    // Mock mode short-circuits before any credential is read — no network, no
    // token material involved.
    if (process.env.GITHUB_MOCK === '1') {
      return new MockGitHubClient();
    }

    // Read the newest connection for this org. This query intentionally reads
    // the encrypted fields so we can decrypt below; nothing else does.
    const connection = await this.prisma.gitHubConnection.findFirst({
      where: { organizationId: currentOrgId() },
      orderBy: { createdAt: 'desc' },
      select: { ciphertext: true, iv: true, authTag: true },
    });

    if (!connection) {
      return null;
    }

    // Decrypt to plaintext only in this local scope.
    const token = decryptSecret({
      ciphertext: connection.ciphertext,
      iv: connection.iv,
      authTag: connection.authTag,
    });

    return new RealGitHubClient(token);
  }
}

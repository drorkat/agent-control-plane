import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { currentOrgId } from '../common/tenant';
import { decryptSecret } from '../common/crypto';
import { AIProvider } from './provider.interface';
import { MockProvider } from './mock.provider';
import { AnthropicProvider } from './anthropic.provider';
import { OpenAIProvider } from './openai.provider';

/**
 * Raised when no provider credential is configured for the agent's provider.
 * Carries a user-facing message pointing at Settings; the run engine surfaces
 * this in a RUN_FAILED event.
 */
export class NoCredentialError extends Error {
  constructor(provider: string) {
    super(
      `No API key configured for provider "${provider}". Add one in Settings.`,
    );
    this.name = 'NoCredentialError';
  }
}

/** The minimal agent shape the factory needs to pick and build a provider. */
type AgentLike = { provider: string };

@Injectable()
export class ProviderFactory {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build the AIProvider for an agent.
   *
   * SECURITY: when a real provider is used, the credential is decrypted here and
   * the plaintext key is handed straight to the adapter instance. The key (and
   * the ciphertext/iv/authTag it came from) never leaves this method — it is
   * never logged, returned, or written to a RunEvent payload.
   */
  async forAgent(agent: AgentLike): Promise<AIProvider> {
    // Mock mode short-circuits before any credential is read — no network, no
    // key material involved.
    if (process.env.AI_MOCK === '1') {
      return new MockProvider();
    }

    // Read the newest credential for this provider. This query intentionally
    // reads the encrypted fields so we can decrypt below; nothing else does.
    const credential = await this.prisma.providerCredential.findFirst({
      where: { organizationId: currentOrgId(), provider: agent.provider },
      orderBy: { createdAt: 'desc' },
      select: { ciphertext: true, iv: true, authTag: true },
    });

    if (!credential) {
      throw new NoCredentialError(agent.provider);
    }

    // Decrypt to plaintext only in this local scope.
    const apiKey = decryptSecret({
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      authTag: credential.authTag,
    });

    switch (agent.provider) {
      case 'anthropic':
        return new AnthropicProvider(apiKey);
      case 'openai':
        return new OpenAIProvider(apiKey);
      default:
        throw new Error(`Unsupported provider "${agent.provider}"`);
    }
  }
}

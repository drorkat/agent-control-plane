import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Providers we currently accept BYOK keys for. */
export const SUPPORTED_PROVIDERS = ['anthropic', 'openai'] as const;

/**
 * Payload for adding a BYOK provider API key.
 *
 * `organizationId` is set by the server (never accepted from the client) and the
 * plaintext `apiKey` is encrypted before it touches the database — it is never
 * persisted in the clear, logged, or returned to the client after saving.
 */
export class CreateProviderDto {
  /** LLM provider this key belongs to. */
  @IsIn(SUPPORTED_PROVIDERS)
  provider!: string;

  /** Optional human-friendly name, e.g. "Production key". */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  /** The raw provider API key. Encrypted at rest; never returned after saving. */
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(500)
  apiKey!: string;
}

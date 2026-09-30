import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Payload for connecting a GitHub account via a Personal Access Token.
 *
 * `organizationId` is set by the server (never accepted from the client) and the
 * plaintext `token` is encrypted before it touches the database — it is never
 * persisted in the clear, logged, or returned to the client after saving.
 */
export class ConnectGithubDto {
  /** The raw GitHub Personal Access Token. Encrypted at rest; never returned. */
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(500)
  token!: string;
}

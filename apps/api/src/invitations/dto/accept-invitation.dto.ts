import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Payload the invitee submits to accept an invitation and create their account.
 *
 * The email and role come from the (server-issued) invitation, not the client;
 * only the display name and a freshly chosen password are accepted here. The
 * plaintext `password` is hashed with bcrypt before it touches the database — it
 * is never persisted in the clear, logged, or returned.
 */
export class AcceptInvitationDto {
  /** Optional display name for the new account. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  /** Password the invitee chooses. Hashed at rest; never returned. */
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}

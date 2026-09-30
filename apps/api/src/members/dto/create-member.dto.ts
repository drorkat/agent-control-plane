import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Roles a member may be created with — deliberately excludes `owner`. */
export const ASSIGNABLE_MEMBER_ROLES = ['admin', 'member', 'viewer'] as const;

/**
 * Payload for adding a member to the current organization.
 *
 * `organizationId` is set by the server (never accepted from the client) and the
 * plaintext `password` is hashed with bcrypt before it touches the database — it
 * is never persisted in the clear, logged, or returned to the client.
 * A new owner cannot be created here: use the update-role endpoint to promote.
 */
export class CreateMemberDto {
  /** Login email. Normalized to lowercase before it is stored. */
  @IsEmail()
  email!: string;

  /** Optional display name. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  /** Initial password. Hashed at rest; never returned. */
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  /** Role to grant. `owner` is not assignable via this endpoint. */
  @IsIn(ASSIGNABLE_MEMBER_ROLES)
  role!: string;
}

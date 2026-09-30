import { IsEmail, IsIn } from 'class-validator';

/** Roles an invitation may grant — deliberately excludes `owner`. */
export const ASSIGNABLE_INVITE_ROLES = ['admin', 'member', 'viewer'] as const;

/**
 * Payload for inviting someone to the current organization by link.
 *
 * `organizationId` and the invite `token` are set by the server (never accepted
 * from the client). No password is collected here — the invitee sets their own
 * when they accept the invitation.
 */
export class CreateInvitationDto {
  /** Email the invitation is issued to. Normalized to lowercase before storage. */
  @IsEmail()
  email!: string;

  /** Role the invitee will be granted on acceptance. `owner` is not assignable. */
  @IsIn(ASSIGNABLE_INVITE_ROLES)
  role!: string;
}

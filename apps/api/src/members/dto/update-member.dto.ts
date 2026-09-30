import { IsIn } from 'class-validator';

/** Roles a member may be updated to — includes `owner` (promotion). */
export const UPDATABLE_MEMBER_ROLES = [
  'owner',
  'admin',
  'member',
  'viewer',
] as const;

/** Payload for changing a member's role. */
export class UpdateMemberDto {
  /** New role for the member. */
  @IsIn(UPDATABLE_MEMBER_ROLES)
  role!: string;
}

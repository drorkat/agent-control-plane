import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Payload for updating a task. Every field is optional; only the fields that are
 * present are changed. Declared as a standalone class (not derived via
 * @nestjs/mapped-types, which is not installed). `status` and `priority` are
 * constrained to the allowed values; `assignedAgentId` is validated against the
 * default org in the service, and may be sent as null/empty to unassign.
 */
export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(['low', 'medium', 'high'])
  priority?: string;

  @IsOptional()
  @IsString()
  @IsIn(['backlog', 'ready', 'in_progress', 'waiting_approval', 'completed', 'failed'])
  status?: string;

  @IsOptional()
  @IsString()
  assignedAgentId?: string;
}

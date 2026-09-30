import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Payload for creating a scheduled run. `organizationId` is set by the server
 * (never accepted from the client), and `active`, `lastRunAt` and `nextRunAt`
 * are managed server-side.
 */
export class CreateScheduleDto {
  /** The task started on each tick. Verified to belong to the caller's org. */
  @IsString()
  @IsNotEmpty()
  taskId!: string;

  /** Optional agent override; falls back to the task's assigned agent. */
  @IsOptional()
  @IsString()
  agentId?: string;

  /** Optional human-readable label for the schedule. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  /** Minutes between runs: 1 minute … 30 days. */
  @IsInt()
  @Min(1)
  @Max(43200)
  intervalMinutes!: number;
}

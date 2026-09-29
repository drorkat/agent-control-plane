import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * Payload for updating an agent. Every field is optional; only the fields that
 * are present are changed. Declared as a standalone class (not derived via
 * @nestjs/mapped-types, which is not installed).
 */
export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  provider?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  model?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  autonomyLevel?: number;

  @IsOptional()
  @IsString()
  @IsIn(['idle', 'working', 'paused'])
  status?: string;
}

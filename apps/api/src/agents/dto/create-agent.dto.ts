import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Payload for creating an agent. `organizationId` and `status` are set by the
 * server (never accepted from the client), so they are absent here.
 */
export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  /** LLM provider, e.g. 'anthropic' | 'openai'. */
  @IsString()
  @IsNotEmpty()
  provider!: string;

  @IsString()
  @IsNotEmpty()
  model!: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  /** 0 (fully supervised) .. 4 (fully autonomous). Defaults to 1. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  autonomyLevel?: number;
}

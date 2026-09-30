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
 * Payload for creating an agent. `organizationId` and `status` are set by the
 * server (never accepted from the client), so they are absent here. Each string
 * field is length-bounded so a request can't stuff megabytes into a column (the
 * body-size limit is only a coarse backstop); `instructions` is generous since
 * it carries a full system prompt.
 */
export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  /** LLM provider, e.g. 'anthropic' | 'openai'. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  provider!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  model!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
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

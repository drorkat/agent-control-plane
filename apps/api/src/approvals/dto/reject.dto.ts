import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectDto {
  /** Optional human-readable reason recorded on the rejected approval. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRunDto {
  /** The task to run. */
  @IsString()
  @IsNotEmpty()
  taskId!: string;

  /**
   * Optional agent override. When omitted, the task's assigned agent is used.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  agentId?: string;
}

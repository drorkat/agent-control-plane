import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// Written as a standalone class (not @nestjs/mapped-types, which is not
// installed): every field is optional, but when a field is supplied it must
// still satisfy the same constraints as on create.
export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  repoUrl?: string;
}

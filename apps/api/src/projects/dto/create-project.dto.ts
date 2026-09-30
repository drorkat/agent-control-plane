import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  repoUrl?: string;

  // GitHub target for the code loop, e.g. owner "acme" + name "web". Optional:
  // a project without a repo simply cannot open pull requests.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  repoOwner?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  repoName?: string;
}

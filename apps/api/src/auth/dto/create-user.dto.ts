import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Payload for `POST /auth/signup`. */
export class CreateUserDto {
  @IsEmail()
  email!: string;

  // Capped at 72: bcrypt silently ignores anything past 72 bytes, so allowing a
  // longer password would mean the extra characters never actually protect the
  // account. Bounding it here keeps "what you typed" == "what secures you".
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  organizationName?: string;
}

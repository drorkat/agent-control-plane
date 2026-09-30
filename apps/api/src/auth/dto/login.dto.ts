import { IsEmail, IsString, MinLength } from 'class-validator';

/** Payload for `POST /auth/login`. */
export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

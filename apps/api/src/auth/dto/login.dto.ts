import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/** Payload for `POST /auth/login`. */
export class LoginDto {
  @IsEmail()
  email!: string;

  // Upper bound guards against absurdly large payloads reaching bcrypt; it is
  // deliberately generous (not the 72-byte cap) so it can never lock out a
  // pre-existing account whose password was set before that cap.
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}

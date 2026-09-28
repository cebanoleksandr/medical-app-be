import { IsEmail } from 'class-validator';

export class DeleteAccountDto {
  /** The account's email, typed again to confirm the deletion. */
  @IsEmail()
  email: string;
}

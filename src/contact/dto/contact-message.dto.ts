import { Transform } from 'class-transformer';
import { Locale, SUPPORTED_LOCALES } from '../../mail/templates/layout';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Landing page "Send us a message" form. */
export class ContactMessageDto {
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  firstName: string;

  @Transform(trim)
  @IsString()
  @Length(1, 100)
  lastName: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  company?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  message?: string;

  /** Language of the confirmation email sent back to the visitor. */
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: Locale;

  /**
   * Honeypot: render it as a hidden input and leave it empty. Bots fill in
   * every field; a filled one means the submission is silently dropped.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;
}

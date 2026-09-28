import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, MaxLength } from 'class-validator';
import { Locale, SUPPORTED_LOCALES } from '../../mail/templates/magic-link';
import { normalizeEmail } from '../token.util';

export class RequestMagicLinkDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: Locale;
}

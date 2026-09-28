import { IsString, Length } from 'class-validator';

export class VerifyMagicLinkDto {
  @IsString()
  @Length(43, 43)
  token: string;
}

import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsTimeZone } from 'class-validator';
import { Framework } from '../../deidentify/catalog/frameworks';

export class DashboardQueryDto {
  /** Start of the period; totals cover all time without it. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  /** End of the period; defaults to now. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @IsEnum(Framework)
  framework?: Framework;

  /** IANA zone the activity chart's days are counted in. */
  @IsOptional()
  @IsTimeZone()
  tz = 'UTC';
}

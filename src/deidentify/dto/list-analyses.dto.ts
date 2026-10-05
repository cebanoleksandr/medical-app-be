import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Framework } from '../catalog/frameworks';

/** Filters shared by the list and its CSV export. */
export class AnalysesFilterDto {
  @IsOptional()
  @IsEnum(Framework)
  framework?: Framework;

  /** Created at or after this moment. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  /** Created at or before this moment. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

export class ListAnalysesDto extends AnalysesFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}

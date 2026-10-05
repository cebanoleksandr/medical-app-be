import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Framework } from '../catalog/frameworks';

export class ListAnalysesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  /** Cursor: `createdAt` of the last analysis from the previous page. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  before?: Date;

  @IsOptional()
  @IsEnum(Framework)
  framework?: Framework;
}

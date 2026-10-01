import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { EntityMethod } from '../catalog/entities';
import { OutputMode } from '../operators';
import { MAX_TEXT_LENGTH } from './create-analysis.dto';

export class RenderEntityDto {
  @IsString()
  @Length(1, 16)
  id: string;

  @IsString()
  @Length(1, 64)
  type: string;

  @IsInt()
  @Min(0)
  start: number;

  @IsInt()
  @Min(1)
  end: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  score: number;

  @IsBoolean()
  included: boolean;

  // Fields of the analysis response, accepted so the client can send entities
  // back as it received them. The server recomputes all of them.
  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  identifier?: string;

  @IsOptional()
  @IsBoolean()
  lowConfidence?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TEXT_LENGTH)
  replacement?: string | null;
}

/**
 * The server keeps no text, so the client sends back the original text and the
 * entities from the analysis with its Included/Excluded choices.
 */
export class RenderAnalysisDto {
  @IsString()
  @Length(50, MAX_TEXT_LENGTH)
  text: string;

  /** Required for analyses run with an output mode (HIPAA). */
  @IsOptional()
  @IsEnum(OutputMode)
  outputMode?: OutputMode;

  /**
   * Analyses run with a risk level: overrides of its preset, replacing the
   * ones the analysis was run with. Omit to keep those.
   */
  @IsOptional()
  @IsObject()
  entityMethods?: Partial<Record<string, EntityMethod>>;

  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => RenderEntityDto)
  entities: RenderEntityDto[];
}

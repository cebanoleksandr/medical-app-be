import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { EntityMethod, RiskLevel } from '../catalog/entities';
import { DeidMethod, Framework } from '../catalog/frameworks';
import { IDENTIFIERS, IdentifierKey } from '../catalog/identifiers';
import { Sensitivity } from '../entities/analysis.entity';
import { OutputMode } from '../operators';
import { AnalysisLanguage } from '../presidio.client';

/** Pasted text is capped at 5 000 chars in the UI; uploaded files may be longer. */
export const MAX_TEXT_LENGTH = 20_000;

export class CreateAnalysisDto {
  @IsString()
  @Length(50, MAX_TEXT_LENGTH)
  text: string;

  @IsIn(['en', 'uk'])
  language: AnalysisLanguage;

  @IsEnum(Framework)
  framework: Framework;

  @IsEnum(DeidMethod)
  method: DeidMethod;

  /** Only for customizable methods; defaults to the method's default set. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(Object.keys(IDENTIFIERS), { each: true })
  identifiers?: IdentifierKey[];

  @IsOptional()
  @IsEnum(OutputMode)
  outputMode: OutputMode = OutputMode.REDACT;

  @IsOptional()
  @IsEnum(Sensitivity)
  sensitivity: Sensitivity = Sensitivity.BALANCED;

  /**
   * GDPR, UK GDPR, FADP only: presets a method per entity type and replaces
   * `outputMode`. Without it those frameworks use `outputMode` as before.
   */
  @IsOptional()
  @IsEnum(RiskLevel)
  riskLevel?: RiskLevel;

  /**
   * Overrides of the risk level's preset, e.g. { "PERSON": "SYNTHETIC" }.
   * Keys and values are checked by resolveEntityMethods.
   */
  @IsOptional()
  @IsObject()
  entityMethods?: Partial<Record<string, EntityMethod>>;
}

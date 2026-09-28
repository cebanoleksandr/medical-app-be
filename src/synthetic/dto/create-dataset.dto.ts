import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Framework } from '../../deidentify/catalog/frameworks';
import { DatasetType } from '../datasets/types';
import { OutputFormat } from '../export/writers';
import { Language } from '../reference/localized';

export const MAX_RECORDS = 100_000;

/** Give either a built-in `datasetType` or a `sourceId`. */
export class CreateDatasetDto {
  @IsOptional()
  @IsEnum(DatasetType)
  datasetType?: DatasetType;

  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @IsEnum(Framework)
  framework: Framework;

  @IsInt()
  @Min(1)
  @Max(MAX_RECORDS)
  recordCount: number;

  @IsEnum(OutputFormat)
  format: OutputFormat;

  /** Ignored for document sources, which keep the document's language. */
  @IsOptional()
  @IsIn(['en', 'uk'])
  language: Language = 'en';
}

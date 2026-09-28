import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';
import { MAX_TEXT_LENGTH } from '../../../deidentify/dto/create-analysis.dto';
import { RenderEntityDto } from '../../../deidentify/dto/render-analysis.dto';

/** Same client-held state as a render: the original text and entity choices. */
export class SourceFromAnalysisDto {
  @IsUUID()
  analysisId: string;

  @IsString()
  @Length(50, MAX_TEXT_LENGTH)
  text: string;

  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => RenderEntityDto)
  entities: RenderEntityDto[];
}

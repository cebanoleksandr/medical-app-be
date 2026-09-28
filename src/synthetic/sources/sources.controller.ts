import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import {
  AuthUser,
  CurrentUser,
} from '../../auth/decorators/current-user.decorator';
import { MAX_UPLOAD_BYTES } from '../../deidentify/text-extraction.service';
import { Language } from '../reference/localized';
import { SourceFromAnalysisDto } from './dto/source-from-analysis.dto';
import { SourcesService } from './sources.service';

@ApiTags('Synthetic data sources')
@Controller('synthetic/sources')
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  /** "Upload your file": .xlsx, .csv or .json, up to 5 MB. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('file')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  fromFile(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
    @Query('language') language: Language = 'en',
  ) {
    if (!file)
      throw new BadRequestException('Attach a file in the "file" field');
    if (!['en', 'uk'].includes(language)) {
      throw new BadRequestException('language must be en or uk');
    }
    return this.sources.createFromFile(user.id, file, language);
  }

  /** "Use de-identified data as source". */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('analysis')
  fromAnalysis(
    @CurrentUser() user: AuthUser,
    @Body() dto: SourceFromAnalysisDto,
  ) {
    return this.sources.createFromAnalysis(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sources.get(user.id, id);
  }
}

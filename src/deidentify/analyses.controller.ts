import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
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
} from '../auth/decorators/current-user.decorator';
import { AuditAction } from '../audit/audit-event.entity';
import { AuditService } from '../audit/audit.service';
import { AnalysesService } from './analyses.service';
import { frameworksView } from './catalog/frameworks';
import { CreateAnalysisDto } from './dto/create-analysis.dto';
import { RenderAnalysisDto } from './dto/render-analysis.dto';
import { Sensitivity } from './entities/analysis.entity';
import { OUTPUT_MODES } from './operators';
import { PresidioClient } from './presidio.client';
import { extname } from 'path';
import {
  MAX_UPLOAD_BYTES,
  TextExtractionService,
} from './text-extraction.service';

@ApiTags('De-identification')
@Controller('analyses')
export class AnalysesController {
  constructor(
    private readonly analyses: AnalysesService,
    private readonly extraction: TextExtractionService,
    private readonly presidio: PresidioClient,
    private readonly audit: AuditService,
  ) {}

  /** Everything the wizard needs to render its choices. */
  @Get('options')
  options() {
    // The wizard opens here: wake a sleeping free-tier Presidio while the
    // user configures the analysis.
    this.presidio.warmUp();
    return {
      frameworks: frameworksView(),
      outputModes: OUTPUT_MODES,
      sensitivities: Object.values(Sensitivity),
      languages: ['en', 'uk'],
    };
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('extract-text')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  async extractText(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file)
      throw new BadRequestException('Attach a file in the "file" field');
    const text = await this.extraction.extract(file);
    await this.audit.record(user.id, AuditAction.TEXT_EXTRACTED, null, {
      format: extname(file.originalname).slice(1).toLowerCase(),
      characters: text.length,
    });
    return { text, characters: text.length };
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAnalysisDto) {
    return this.analyses.create(user.id, dto);
  }

  @Post(':id/render')
  @HttpCode(HttpStatus.OK)
  render(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenderAnalysisDto,
  ) {
    return this.analyses.render(user.id, id, dto);
  }
}

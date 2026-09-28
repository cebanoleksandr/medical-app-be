import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import {
  AuthUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { CreateDatasetDto } from './dto/create-dataset.dto';
import { ListRecordsDto } from './dto/list-records.dto';
import { ClientGoneError, OutputFormat } from './export/writers';
import { PresidioClient } from '../deidentify/presidio.client';
import { SyntheticService } from './synthetic.service';
import { ValidationService } from './validation/validation.service';

@ApiTags('Synthetic data')
@Controller('synthetic')
export class SyntheticController {
  private readonly logger = new Logger(SyntheticController.name);

  constructor(
    private readonly synthetic: SyntheticService,
    private readonly validation: ValidationService,
    private readonly presidio: PresidioClient,
  ) {}

  @Get('options')
  options() {
    // Validation and file sources need Presidio; wake it early.
    this.presidio.warmUp();
    return this.synthetic.options();
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('datasets')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDatasetDto) {
    return this.synthetic.create(user.id, dto);
  }

  @Get('datasets/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.synthetic.get(user.id, id);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('datasets/:id/regenerate')
  regenerate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.synthetic.regenerate(user.id, id);
  }

  /** Compliance, data quality and the validation checklist. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('datasets/:id/validation')
  validate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.validation.validate(user.id, id);
  }

  @Get('datasets/:id/records')
  listRecords(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListRecordsDto,
  ) {
    return this.synthetic.listRecords(user.id, id, query);
  }

  @Get('datasets/:id/records/:recordId')
  getRecord(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('recordId') recordId: string,
  ) {
    return this.synthetic.getRecord(user.id, id, recordId);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('datasets/:id/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
    @Query('format', new ParseEnumPipe(OutputFormat, { optional: true }))
    format?: OutputFormat,
  ) {
    const file = await this.synthetic.prepareDownload(user.id, id, format);
    res.setHeader('content-type', file.contentType);
    res.setHeader(
      'content-disposition',
      `attachment; filename="${file.filename}"`,
    );
    res.setHeader('cache-control', 'no-store');

    try {
      await file.write(res);
      res.end();
      await file.recordDownload();
    } catch (err) {
      if (!(err instanceof ClientGoneError)) {
        // Headers are already sent, so the only signal left is a cut stream.
        this.logger.error(`Download failed: ${(err as Error).message}`);
      }
      res.destroy();
    }
  }
}

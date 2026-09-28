import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'crypto';
import { Writable } from 'stream';
import { Repository } from 'typeorm';
import { AuditAction } from '../audit/audit-event.entity';
import { AuditService } from '../audit/audit.service';
import { FRAMEWORKS } from '../deidentify/catalog/frameworks';
import {
  DatasetDefinition,
  DATASETS,
  generateRecord,
  generateRecords,
  SourceDatasetType,
} from './datasets';
import { CreateDatasetDto, MAX_RECORDS } from './dto/create-dataset.dto';
import { ListRecordsDto } from './dto/list-records.dto';
import { SyntheticDataset } from './entities/synthetic-dataset.entity';
import { estimateBytes } from './export/size-estimator';
import { FORMATS, OutputFormat, writeDataset } from './export/writers';
import {
  GenerationParams,
  parseRecordId,
  recordId,
  SyntheticRecord,
} from './generator';
import { SourceKind } from './sources/synthetic-source.entity';
import { SourcesService } from './sources/sources.service';

export type RecordQuality = 'GOOD' | 'FAIR';

export function rateRecord(
  definition: DatasetDefinition,
  record: SyntheticRecord,
) {
  const issues = definition.checkRecord(record);
  return {
    quality: (issues.length ? 'FAIR' : 'GOOD') as RecordQuality,
    issues,
  };
}

@Injectable()
export class SyntheticService {
  constructor(
    @InjectRepository(SyntheticDataset)
    private readonly datasets: Repository<SyntheticDataset>,
    private readonly sources: SourcesService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async options() {
    const types = Object.values(DATASETS);
    const bytesPerRecord: Record<string, Record<string, number>> = {};
    for (const type of types) {
      bytesPerRecord[type.id] = {};
      for (const format of Object.values(OutputFormat)) {
        // Per-record cost at scale; the fixed header/zip overhead is ignored.
        const bytes = await estimateBytes(type, type.id, format, 'en', 1000);
        bytesPerRecord[type.id][format] = Math.round(bytes / 1000);
      }
    }

    return {
      datasetTypes: types.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        columns: t.columns,
        previewColumns: t.previewColumns,
      })),
      frameworks: FRAMEWORKS.map(({ id, name, description }) => ({
        id,
        name,
        description,
      })),
      formats: Object.values(OutputFormat),
      languages: ['en', 'uk'],
      maxRecords: MAX_RECORDS,
      bytesPerRecord,
    };
  }

  async create(userId: string, dto: CreateDatasetDto) {
    if (Boolean(dto.datasetType) === Boolean(dto.sourceId)) {
      throw new BadRequestException('Provide either datasetType or sourceId');
    }

    let datasetType = dto.datasetType as SyntheticDataset['datasetType'];
    let language = dto.language;
    if (dto.sourceId) {
      const source = await this.sources.findActive(userId, dto.sourceId);
      datasetType =
        source.kind === SourceKind.FILE
          ? SourceDatasetType.FROM_FILE
          : SourceDatasetType.FROM_DOCUMENT;
      if (source.kind === SourceKind.DOCUMENT) language = source.language;
    }

    const now = new Date();
    const ttlMinutes = this.config.get<number>('SYNTH_DATASET_TTL_MINUTES');
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
    const dataset = await this.datasets.save(
      this.datasets.create({
        userId,
        datasetType,
        sourceId: dto.sourceId ?? null,
        framework: dto.framework,
        language,
        recordCount: dto.recordCount,
        format: dto.format,
        seed: randomInt(2 ** 31 - 1),
        referenceDate: now,
        expiresAt,
      }),
    );
    if (dto.sourceId) await this.sources.extendTo(dto.sourceId, expiresAt);
    await this.audit.record(userId, AuditAction.DATASET_CREATED, dataset.id, {
      datasetType,
      framework: dto.framework,
      records: dto.recordCount,
      format: dto.format,
    });
    return this.summary(dataset);
  }

  async get(userId: string, id: string) {
    return this.summary(await this.findActive(userId, id));
  }

  /** Same settings and source, new seed: a fresh dataset with a new id. */
  async regenerate(userId: string, id: string) {
    const previous = await this.datasets.findOneBy({ id, userId });
    if (!previous) throw new NotFoundException();
    if (previous.datasetType in SourceDatasetType && !previous.sourceId) {
      throw new GoneException(
        'The source expired. Upload it again to continue.',
      );
    }
    return this.create(userId, {
      ...(previous.sourceId
        ? { sourceId: previous.sourceId }
        : {
            datasetType:
              previous.datasetType as CreateDatasetDto['datasetType'],
          }),
      framework: previous.framework,
      recordCount: previous.recordCount,
      format: previous.format,
      language: previous.language,
    });
  }

  async listRecords(userId: string, id: string, query: ListRecordsDto) {
    const dataset = await this.findActive(userId, id);
    const definition = await this.definitionOf(dataset);
    const columns = query.columns ?? definition.previewColumns;

    const known = new Set(definition.columns.map((c) => c.key));
    const unknown = columns.filter((c) => !known.has(c));
    if (unknown.length) {
      throw new BadRequestException(`Unknown columns: ${unknown.join(', ')}`);
    }

    const params = this.params(dataset);
    const end = Math.min(query.offset + query.limit, dataset.recordCount);
    const rows = [];
    for (let i = query.offset; i < end; i++) {
      const record = generateRecord(definition, params, i);
      rows.push({
        recordId: recordId(i),
        ...rateRecord(definition, record),
        values: Object.fromEntries(columns.map((c) => [c, record[c]])),
      });
    }

    return {
      total: dataset.recordCount,
      offset: query.offset,
      limit: query.limit,
      columns,
      rows,
    };
  }

  async getRecord(userId: string, id: string, recordIdParam: string) {
    const dataset = await this.findActive(userId, id);
    const index = parseRecordId(recordIdParam);
    if (index === null || index >= dataset.recordCount) {
      throw new NotFoundException('Record not found');
    }
    const definition = await this.definitionOf(dataset);
    const record = generateRecord(definition, this.params(dataset), index);
    return {
      recordId: recordIdParam,
      ...rateRecord(definition, record),
      values: record,
    };
  }

  async prepareDownload(userId: string, id: string, format?: OutputFormat) {
    const dataset = await this.findActive(userId, id);
    const definition = await this.definitionOf(dataset);
    const outputFormat = format ?? dataset.format;
    const { extension, contentType } = FORMATS[outputFormat];
    const typeSlug = dataset.datasetType.toLowerCase().replace(/_/g, '-');

    return {
      recordDownload: () =>
        this.audit.record(userId, AuditAction.DATASET_DOWNLOADED, dataset.id, {
          format: outputFormat,
          records: dataset.recordCount,
        }),
      filename: `synthetic-${typeSlug}-${dataset.recordCount}.${extension}`,
      contentType,
      write: (out: Writable) =>
        writeDataset(
          outputFormat,
          definition.columns,
          generateRecords(
            definition,
            this.params(dataset),
            dataset.recordCount,
          ),
          out,
        ),
    };
  }

  async findActive(userId: string, id: string) {
    const dataset = await this.datasets.findOneBy({ id, userId });
    if (!dataset) throw new NotFoundException();
    if (dataset.expiresAt <= new Date()) {
      throw new GoneException('Dataset expired. Regenerate it to continue.');
    }
    return dataset;
  }

  async definitionOf(dataset: SyntheticDataset): Promise<DatasetDefinition> {
    if (dataset.datasetType in DATASETS) {
      return DATASETS[dataset.datasetType as keyof typeof DATASETS];
    }
    if (!dataset.sourceId) {
      throw new GoneException(
        'The source expired. Upload it again to continue.',
      );
    }
    return this.sources.definitionFor(dataset.userId, dataset.sourceId);
  }

  params(dataset: SyntheticDataset): GenerationParams {
    return {
      framework: dataset.framework,
      language: dataset.language,
      seed: dataset.seed,
      referenceDate: dataset.referenceDate,
    };
  }

  private async summary(dataset: SyntheticDataset) {
    const definition = await this.definitionOf(dataset);
    return {
      id: dataset.id,
      datasetType: dataset.datasetType,
      sourceId: dataset.sourceId,
      framework: dataset.framework,
      language: dataset.language,
      format: dataset.format,
      records: dataset.recordCount,
      fields: definition.columns.length,
      columns: definition.columns,
      previewColumns: definition.previewColumns,
      estimatedBytes: await estimateBytes(
        definition,
        dataset.sourceId ?? dataset.datasetType,
        dataset.format,
        dataset.language,
        dataset.recordCount,
      ),
      createdAt: dataset.createdAt,
      expiresAt: dataset.expiresAt,
    };
  }
}

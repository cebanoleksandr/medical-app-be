import {
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { AuditAction } from '../../audit/audit-event.entity';
import { AuditService } from '../../audit/audit.service';
import { JsonCipher } from '../../common/cipher';
import {
  AnalysesService,
  LOW_CONFIDENCE_BELOW,
} from '../../deidentify/analyses.service';
import { DeidMethod, findMethod } from '../../deidentify/catalog/frameworks';
import { PresidioClient } from '../../deidentify/presidio.client';
import { DatasetDefinition } from '../datasets';
import { Language } from '../reference/localized';
import { SourceFromAnalysisDto } from './dto/source-from-analysis.dto';
import { fileDataset } from './file-dataset';
import { FileProfile, profileTable } from './profiler';
import { SourceKind, SyntheticSource } from './synthetic-source.entity';
import { readTable } from './tabular';
import { buildTemplate, documentDataset, DocumentTemplate } from './template';

/** Entity types that make a table value an identifier. */
export const DIRECT_IDENTIFIER_TYPES = [
  'PERSON',
  'EMAIL_ADDRESS',
  'PHONE_NUMBER',
  'US_SSN',
  'UA_RNOKPP',
  'UA_PASSPORT',
  'CH_AHV',
  'US_PASSPORT',
  'US_DRIVER_LICENSE',
  'IBAN_CODE',
  'CREDIT_CARD',
  'IP_ADDRESS',
  'URL',
  'MEDICAL_RECORD_NUMBER',
];
const PURGE_EVERY_MS = 10 * 60 * 1000;
const MAX_CACHED_DEFINITIONS = 50;

@Injectable()
export class SourcesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SourcesService.name);
  private readonly cipher: JsonCipher;
  private readonly definitions = new Map<string, DatasetDefinition>();
  private purgeTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(SyntheticSource)
    private readonly sources: Repository<SyntheticSource>,
    private readonly analyses: AnalysesService,
    private readonly presidio: PresidioClient,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {
    this.cipher = new JsonCipher(config.getOrThrow('SOURCE_ENCRYPTION_KEY'));
  }

  onModuleInit() {
    void this.purgeExpired();
    this.purgeTimer = setInterval(
      () => void this.purgeExpired(),
      PURGE_EVERY_MS,
    );
    this.purgeTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.purgeTimer);
  }

  async createFromFile(
    userId: string,
    file: Express.Multer.File,
    language: Language,
  ) {
    const table = await readTable(file);
    const { profile, summary } = await profileTable(table, (values) =>
      this.detectIdentifiers(values, language),
    );
    if (!profile.columns.some((c) => c.kind !== 'identifier')) {
      throw new UnprocessableEntityException(
        'No column can be synthesized: every column is an identifier or free text',
      );
    }
    return this.save(userId, SourceKind.FILE, language, profile, {
      rows: profile.rowCount,
      columns: summary,
    });
  }

  async createFromAnalysis(userId: string, dto: SourceFromAnalysisDto) {
    const analysis = await this.analyses.loadWithClientState(
      userId,
      dto.analysisId,
      dto,
    );
    const language = analysis.language as Language;
    const template = buildTemplate(
      dto.text,
      dto.entities,
      language,
      LOW_CONFIDENCE_BELOW,
    );
    const slots = template.segments.filter((s) => typeof s !== 'string');

    return this.save(userId, SourceKind.DOCUMENT, language, template, {
      analysisId: analysis.id,
      framework: analysis.framework,
      method: analysis.method,
      requiresReview: findMethod(
        analysis.framework,
        analysis.method as DeidMethod,
      )?.requiresReview,
      identifiersReplaced: slots.length,
      lowConfidenceSlots: slots.filter(
        (s) => typeof s !== 'string' && s.lowConfidence,
      ).length,
      excludedEntities: dto.entities.filter((e) => !e.included).length,
    });
  }

  async get(userId: string, id: string) {
    return this.view(await this.findActive(userId, id));
  }

  /** Throws 410 once the source expired: its datasets can't be generated anymore. */
  async findActive(userId: string, id: string): Promise<SyntheticSource> {
    const source = await this.sources.findOneBy({ id, userId });
    if (!source) throw new NotFoundException('Source not found');
    if (source.expiresAt <= new Date()) {
      throw new GoneException(
        'The source expired. Upload it again to continue.',
      );
    }
    return source;
  }

  async definitionFor(userId: string, id: string): Promise<DatasetDefinition> {
    const cached = this.definitions.get(id);
    if (cached) {
      await this.findActive(userId, id);
      return cached;
    }
    const source = await this.findActive(userId, id);
    const definition =
      source.kind === SourceKind.FILE
        ? fileDataset(this.cipher.decrypt<FileProfile>(source.payload))
        : documentDataset(
            this.cipher.decrypt<DocumentTemplate>(source.payload),
          );
    if (this.definitions.size >= MAX_CACHED_DEFINITIONS)
      this.definitions.clear();
    this.definitions.set(id, definition);
    return definition;
  }

  /** A dataset built on a source keeps it alive at least as long as itself. */
  async extendTo(id: string, until: Date) {
    await this.sources.update(
      { id, expiresAt: LessThan(until) },
      { expiresAt: until },
    );
  }

  async purgeExpired() {
    try {
      const { affected } = await this.sources.delete({
        expiresAt: LessThan(new Date()),
      });
      if (affected) {
        this.definitions.clear();
        this.logger.log(`Purged ${affected} expired sources`);
      }
    } catch (err) {
      this.logger.error(`Purging sources failed: ${(err as Error).message}`);
    }
  }

  private async save(
    userId: string,
    kind: SourceKind,
    language: Language,
    payload: unknown,
    summary: Record<string, unknown>,
  ) {
    const ttlMinutes = this.config.get<number>('SYNTH_DATASET_TTL_MINUTES');
    const source = await this.sources.save(
      this.sources.create({
        userId,
        kind,
        language,
        summary,
        payload: this.cipher.encrypt(payload),
        expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
      }),
    );
    await this.audit.record(userId, AuditAction.SOURCE_CREATED, source.id, {
      kind,
    });
    return this.view(source);
  }

  private view(source: SyntheticSource) {
    return {
      id: source.id,
      kind: source.kind,
      language: source.language,
      summary: source.summary,
      createdAt: source.createdAt,
      expiresAt: source.expiresAt,
    };
  }

  /** One Presidio call; each value on its own line so hits map back to values. */
  private async detectIdentifiers(
    values: string[],
    language: Language,
  ): Promise<boolean[]> {
    const offsets: number[] = [];
    let text = '';
    for (const value of values) {
      offsets.push(text.length);
      text += value.replace(/\n/g, ' ') + '\n';
    }
    const hits = new Array<boolean>(values.length).fill(false);
    for (let start = 0; start < text.length;) {
      // Chunk on line boundaries to respect the service's input limit.
      let end = Math.min(start + 40_000, text.length);
      if (end < text.length) end = text.lastIndexOf('\n', end) + 1 || end;
      const entities = await this.presidio.analyze({
        text: text.slice(start, end),
        language,
        entities: DIRECT_IDENTIFIER_TYPES,
        scoreThreshold: 0.5,
      });
      for (const e of entities) {
        const at = start + e.start;
        let lo = 0;
        let hi = offsets.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (offsets[mid] <= at) lo = mid;
          else hi = mid - 1;
        }
        hits[lo] = true;
      }
      start = end;
    }
    return hits;
  }
}

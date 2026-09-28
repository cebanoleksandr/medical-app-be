import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import { Repository } from 'typeorm';
import { AuditAction } from '../audit/audit-event.entity';
import { AuditService } from '../audit/audit.service';
import { applyReplacements, hasOverlaps, resolveOverlaps } from './anonymizer';
import { findMethod } from './catalog/frameworks';
import { entityTypeIndex, IdentifierKey } from './catalog/identifiers';
import { CreateAnalysisDto } from './dto/create-analysis.dto';
import { RenderAnalysisDto, RenderEntityDto } from './dto/render-analysis.dto';
import { Analysis, Sensitivity } from './entities/analysis.entity';
import { buildReplacements } from './operators';
import { AnalysisLanguage, PresidioClient } from './presidio.client';

const SCORE_THRESHOLDS: Record<Sensitivity, number> = {
  [Sensitivity.CONSERVATIVE]: 0.6,
  [Sensitivity.BALANCED]: 0.4,
  [Sensitivity.AGGRESSIVE]: 0.25,
};

/** Entities below this score get a warning in the review UI. */
export const LOW_CONFIDENCE_BELOW = 0.7;

interface EntityInput {
  id: string;
  type: string;
  start: number;
  end: number;
  score: number;
  included: boolean;
}

export interface DetectedEntityView extends EntityInput {
  identifier: IdentifierKey;
  text: string;
  lowConfidence: boolean;
  /** null when the entity is excluded and left unchanged. */
  replacement: string | null;
}

@Injectable()
export class AnalysesService {
  constructor(
    @InjectRepository(Analysis) private readonly analyses: Repository<Analysis>,
    private readonly presidio: PresidioClient,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async create(userId: string, dto: CreateAnalysisDto) {
    const started = performance.now();
    const identifiers = this.resolveIdentifiers(dto);
    const entityTypes = [...entityTypeIndex(identifiers).keys()];

    const spans = entityTypes.length
      ? await this.presidio.analyze({
          text: dto.text,
          language: dto.language,
          entities: entityTypes,
          scoreThreshold: SCORE_THRESHOLDS[dto.sensitivity],
        })
      : [];
    const entities: EntityInput[] = resolveOverlaps(spans).map((span, i) => ({
      id: `e${i + 1}`,
      ...span,
      included: true,
    }));

    const analysis = this.analyses.create({
      id: randomUUID(),
      userId,
      framework: dto.framework,
      method: dto.method,
      identifiers,
      outputMode: dto.outputMode,
      language: dto.language,
      sensitivity: dto.sensitivity,
      inputLength: dto.text.length,
      detectedCount: entities.length,
      processedCount: entities.length,
      avgConfidence: entities.length
        ? entities.reduce((sum, e) => sum + e.score, 0) / entities.length
        : null,
      entityCounts: countBy(entities.map((e) => e.type)),
    });
    const view = this.buildView(analysis, dto.text, entities);
    analysis.processingMs = Math.round(performance.now() - started);
    await this.analyses.save(analysis);
    await this.audit.record(userId, AuditAction.ANALYSIS_CREATED, analysis.id, {
      framework: analysis.framework,
      method: analysis.method,
      language: analysis.language,
      detected: analysis.detectedCount,
    });

    return this.toResponse(analysis, view);
  }

  /** Re-applies the output after the user toggles entities or changes the mode. */
  async render(userId: string, id: string, dto: RenderAnalysisDto) {
    const analysis = await this.loadWithClientState(userId, id, dto);

    analysis.outputMode = dto.outputMode;
    const view = this.buildView(analysis, dto.text, dto.entities);
    analysis.processedCount = dto.entities.filter((e) => e.included).length;
    await this.analyses.save(analysis);

    return this.toResponse(analysis, view);
  }

  /**
   * The server keeps no text, so anything built on an analysis gets the text
   * and entity decisions back from the client and checks them here.
   */
  async loadWithClientState(
    userId: string,
    id: string,
    state: { text: string; entities: RenderEntityDto[] },
  ): Promise<Analysis> {
    const analysis = await this.analyses.findOneBy({ id, userId });
    if (!analysis) throw new NotFoundException();

    if (state.text.length !== analysis.inputLength) {
      throw new BadRequestException('Text differs from the analysed text');
    }
    this.assertValidEntities(analysis, state);
    return analysis;
  }

  private resolveIdentifiers(dto: CreateAnalysisDto): IdentifierKey[] {
    const method = findMethod(dto.framework, dto.method);
    if (!method) {
      throw new BadRequestException(
        `Method ${dto.method} is not available for ${dto.framework}`,
      );
    }
    if (!dto.identifiers) return method.defaultIdentifiers;

    if (!method.customizable) {
      throw new BadRequestException(
        `${dto.method} applies a fixed set of identifiers`,
      );
    }
    const unknown = dto.identifiers.filter(
      (key) => !method.identifiers.includes(key),
    );
    if (unknown.length || !dto.identifiers.length) {
      throw new BadRequestException(
        `Choose identifiers from: ${method.identifiers.join(', ')}`,
      );
    }
    return dto.identifiers;
  }

  private assertValidEntities(
    analysis: Analysis,
    dto: { text: string; entities: RenderEntityDto[] },
  ) {
    const applied = entityTypeIndex(analysis.identifiers);
    const ids = new Set<string>();

    for (const e of dto.entities) {
      if (e.end <= e.start || e.end > dto.text.length) {
        throw new BadRequestException(`Entity ${e.id} is out of range`);
      }
      if (!applied.has(e.type)) {
        throw new BadRequestException(
          `Entity type ${e.type} is not applied in this analysis`,
        );
      }
      if (ids.has(e.id)) {
        throw new BadRequestException(`Duplicate entity id ${e.id}`);
      }
      ids.add(e.id);
    }
    if (hasOverlaps(dto.entities)) {
      throw new BadRequestException('Entities must not overlap');
    }
  }

  private buildView(analysis: Analysis, text: string, entities: EntityInput[]) {
    const identifierByType = entityTypeIndex(analysis.identifiers);
    const included = entities.filter((e) => e.included);
    const replacements = buildReplacements(
      included.map((e) => ({
        type: e.type,
        value: text.slice(e.start, e.end),
      })),
      {
        mode: analysis.outputMode,
        language: analysis.language as AnalysisLanguage,
        analysisId: analysis.id,
        pseudonymSecret: this.config.getOrThrow('PSEUDONYM_SECRET'),
      },
    );
    const replacementById = new Map(
      included.map((e, i) => [e.id, replacements[i]]),
    );

    const views: DetectedEntityView[] = entities
      .map((e) => ({
        id: e.id,
        type: e.type,
        identifier: identifierByType.get(e.type),
        text: text.slice(e.start, e.end),
        start: e.start,
        end: e.end,
        score: e.score,
        lowConfidence: e.score < LOW_CONFIDENCE_BELOW,
        included: e.included,
        replacement: replacementById.get(e.id) ?? null,
      }))
      .sort((a, b) => a.start - b.start);

    return {
      entities: views,
      deidentifiedText: applyReplacements(
        text,
        views.filter((e) => e.included),
      ),
    };
  }

  private toResponse(
    analysis: Analysis,
    view: ReturnType<AnalysesService['buildView']>,
  ) {
    return {
      id: analysis.id,
      createdAt: analysis.createdAt,
      framework: analysis.framework,
      method: analysis.method,
      identifiers: analysis.identifiers,
      outputMode: analysis.outputMode,
      language: analysis.language,
      sensitivity: analysis.sensitivity,
      stats: {
        detected: analysis.detectedCount,
        processed: analysis.processedCount,
        avgConfidence: analysis.avgConfidence,
        processingMs: analysis.processingMs,
      },
      ...view,
    };
  }
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
}

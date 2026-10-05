import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import { LessThan, Repository } from 'typeorm';
import { AuditAction } from '../audit/audit-event.entity';
import { AuditService } from '../audit/audit.service';
import { applyReplacements, hasOverlaps, resolveOverlaps } from './anonymizer';
import {
  ENTITY_CONFIG_FRAMEWORKS,
  ENTITY_TYPE_BY_PRESIDIO,
  EntityConfigError,
  EntityMethods,
  EntityType,
  resolveEntityMethods,
} from './catalog/entities';
import { findMethod, Framework } from './catalog/frameworks';
import { entityTypeIndex, IdentifierKey } from './catalog/identifiers';
import { CreateAnalysisDto } from './dto/create-analysis.dto';
import { RenderAnalysisDto, RenderEntityDto } from './dto/render-analysis.dto';
import { Analysis, Sensitivity } from './entities/analysis.entity';
import { buildEntityReplacements, buildReplacements } from './operators';
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
  identifier: IdentifierKey | undefined;
  /** Analyses run with a risk level: the entity type that set its method. */
  entityType: EntityType | undefined;
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

  /** The user's analyses, newest first: settings and counts, never text. */
  async list(
    userId: string,
    {
      limit,
      before,
      framework,
    }: { limit: number; before?: Date; framework?: Framework },
  ) {
    const rows = await this.analyses.find({
      where: {
        userId,
        ...(before ? { createdAt: LessThan(before) } : {}),
        ...(framework ? { framework } : {}),
      },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return rows.map((a) => ({
      id: a.id,
      createdAt: a.createdAt,
      framework: a.framework,
      method: a.method,
      riskLevel: a.riskLevel,
      language: a.language,
      characters: a.inputLength,
      detected: a.detectedCount,
      processed: a.processedCount,
    }));
  }

  async create(userId: string, dto: CreateAnalysisDto) {
    const started = performance.now();
    const identifiers = this.resolveIdentifiers(dto);
    const entityMethods = this.resolveEntityConfig(dto);
    // With a risk level every entity type gets a method, so all are detected.
    const entityTypes = entityMethods
      ? [...ENTITY_TYPE_BY_PRESIDIO.keys()]
      : [...entityTypeIndex(identifiers).keys()];

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
      riskLevel: dto.riskLevel ?? null,
      entityMethods,
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
      riskLevel: analysis.riskLevel,
      language: analysis.language,
      detected: analysis.detectedCount,
    });

    return this.toResponse(analysis, view);
  }

  /** Re-applies the output after the user toggles entities or changes the mode. */
  async render(userId: string, id: string, dto: RenderAnalysisDto) {
    const analysis = await this.loadWithClientState(userId, id, dto);

    this.applyRenderSettings(analysis, dto);
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

  /** Methods per entity type, or null for an output-mode analysis. */
  private resolveEntityConfig(dto: CreateAnalysisDto): EntityMethods | null {
    if (!dto.riskLevel) {
      if (dto.entityMethods) {
        throw new BadRequestException('entityMethods requires riskLevel');
      }
      return null;
    }
    if (!ENTITY_CONFIG_FRAMEWORKS.includes(dto.framework)) {
      throw new BadRequestException(
        `${dto.framework} uses an output mode, not a risk level`,
      );
    }
    return toBadRequest(() =>
      resolveEntityMethods(dto.riskLevel!, dto.entityMethods),
    );
  }

  /** A render keeps the analysis' kind: output mode or methods per entity. */
  private applyRenderSettings(analysis: Analysis, dto: RenderAnalysisDto) {
    if (analysis.riskLevel) {
      if (dto.entityMethods) {
        analysis.entityMethods = toBadRequest(() =>
          resolveEntityMethods(analysis.riskLevel!, dto.entityMethods),
        );
      }
      return;
    }
    if (dto.entityMethods) {
      throw new BadRequestException(
        'This analysis uses an output mode, not entityMethods',
      );
    }
    if (!dto.outputMode)
      throw new BadRequestException('outputMode is required');
    analysis.outputMode = dto.outputMode;
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
    const applied: ReadonlyMap<string, unknown> = analysis.entityMethods
      ? ENTITY_TYPE_BY_PRESIDIO
      : entityTypeIndex(analysis.identifiers);
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
    const targets = included.map((e) => ({
      type: e.type,
      value: text.slice(e.start, e.end),
    }));
    const ctx = {
      language: analysis.language as AnalysisLanguage,
      analysisId: analysis.id,
      pseudonymSecret: this.config.getOrThrow<string>('PSEUDONYM_SECRET'),
    };
    const { entityMethods } = analysis;
    const replacements = entityMethods
      ? buildEntityReplacements(
          targets.map((t) => ({
            ...t,
            method: entityMethods[ENTITY_TYPE_BY_PRESIDIO.get(t.type)!],
          })),
          ctx,
        )
      : buildReplacements(targets, { ...ctx, mode: analysis.outputMode });
    const replacementById = new Map(
      included.map((e, i) => [e.id, replacements[i]]),
    );

    const views: DetectedEntityView[] = entities
      .map((e) => ({
        id: e.id,
        type: e.type,
        identifier: identifierByType.get(e.type),
        entityType: analysis.entityMethods
          ? ENTITY_TYPE_BY_PRESIDIO.get(e.type)
          : undefined,
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
      riskLevel: analysis.riskLevel,
      entityMethods: analysis.entityMethods,
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

/** Catalogue rule violations (unknown keys, special categories) are 400s. */
function toBadRequest<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof EntityConfigError) {
      throw new BadRequestException(err.message);
    }
    throw err;
  }
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
}

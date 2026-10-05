import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AnalysesService } from '../deidentify/analyses.service';
import {
  ENTITY_TYPE_BY_PRESIDIO,
  ENTITY_TYPE_KEYS,
  EntityMethod,
} from '../deidentify/catalog/entities';
import { OutputMode } from '../deidentify/operators';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

const DAY_MS = 86_400_000;
/** The chart shows this many days when no `from` is given. */
const DEFAULT_DAYS = 7;
/** One point per day; longer periods would need weekly buckets. */
const MAX_DAYS = 366;
const RECENT_ANALYSES = 5;

// HIPAA output modes share the entity-method vocabulary, except the spelling.
const OUTPUT_MODE_METHOD: Record<OutputMode, EntityMethod> = {
  [OutputMode.REDACT]: EntityMethod.REDACT,
  [OutputMode.MASK]: EntityMethod.MASK,
  [OutputMode.PLACEHOLDER]: EntityMethod.PLACEHOLDER,
  [OutputMode.PSEUDONYMIZE]: EntityMethod.PSEUDONYMISE,
};

const PRESIDIO_TO_ENTITY_TYPE = JSON.stringify(
  Object.fromEntries(ENTITY_TYPE_BY_PRESIDIO),
);

/**
 * Rows of one user in the period and framework. Every query below binds
 * $1 user, $2 from (or null), $3 to, $4 framework (or null).
 */
const scope = (alias: string) => `
  ${alias}.user_id = $1
  AND ($2::timestamptz IS NULL OR ${alias}.created_at >= $2)
  AND ${alias}.created_at <= $3
  AND ($4::varchar IS NULL OR ${alias}.framework = $4)`;

@Injectable()
export class DashboardService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly analyses: AnalysesService,
    private readonly audit: AuditService,
  ) {}

  async get(userId: string, query: DashboardQueryDto) {
    const to = query.to ?? new Date();
    if (query.from && query.from > to) {
      throw new BadRequestException('"from" must be before "to"');
    }
    const chartFrom =
      query.from ?? new Date(to.getTime() - (DEFAULT_DAYS - 1) * DAY_MS);
    if (to.getTime() - chartFrom.getTime() > MAX_DAYS * DAY_MS) {
      throw new BadRequestException(`The period can't exceed ${MAX_DAYS} days`);
    }

    const params = [userId, query.from ?? null, to, query.framework ?? null];
    const [[analyses], [datasets], activity, frameworks, entityTypes, methods] =
      await Promise.all([
        this.db.query(
          `SELECT count(*)::int AS count,
                  coalesce(sum(detected_count), 0)::int AS "entitiesDetected",
                  coalesce(sum(processed_count), 0)::int AS "entitiesProcessed"
             FROM analyses a WHERE ${scope('a')}`,
          params,
        ),
        this.db.query(
          `SELECT count(*)::int AS count,
                  coalesce(sum(record_count), 0)::int AS "recordsGenerated",
                  count(*) FILTER (WHERE expires_at > now())::int AS active
             FROM synthetic_datasets d WHERE ${scope('d')}`,
          params,
        ),
        this.activity(params, chartFrom, query.tz),
        this.db.query(
          `SELECT framework, count(*)::int AS count
             FROM analyses a WHERE ${scope('a')}
            GROUP BY framework ORDER BY count DESC, framework`,
          params,
        ),
        this.entityTypes(params),
        this.methods(params),
      ]);

    return {
      analyses: {
        ...analyses,
        // Share of detected entities the user kept anonymized after review.
        anonymizationRate: analyses.entitiesDetected
          ? analyses.entitiesProcessed / analyses.entitiesDetected
          : null,
      },
      datasets,
      activity,
      frameworks,
      entityTypes,
      methods,
      recentAnalyses: await this.analyses.list(userId, {
        limit: RECENT_ANALYSES,
        framework: query.framework,
      }),
      recentActivity: await this.audit.list(userId, 10),
    };
  }

  /** Analyses and detected entities per day, empty days included. */
  private activity(params: unknown[], from: Date, tz: string) {
    return this.db.query(
      `SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
              count(a.id)::int AS documents,
              coalesce(sum(a.detected_count), 0)::int AS entities
         FROM generate_series(
                ($5::timestamptz AT TIME ZONE $6)::date,
                ($3::timestamptz AT TIME ZONE $6)::date,
                interval '1 day'
              ) AS d(day)
         LEFT JOIN analyses a
           ON ${scope('a')}
          AND a.created_at >= $5
          AND (a.created_at AT TIME ZONE $6)::date = d.day::date
        GROUP BY d.day
        ORDER BY d.day`,
      [...params, from, tz],
    ) as Promise<{ date: string; documents: number; entities: number }[]>;
  }

  /** Detected entities per catalogue type, every type listed, largest first. */
  private async entityTypes(params: unknown[]) {
    const rows: { type: string; count: number }[] = await this.db.query(
      `SELECT c.key AS type, sum(c.value::int)::int AS count
         FROM analyses a, jsonb_each_text(a.entity_counts) c
        WHERE ${scope('a')}
        GROUP BY c.key`,
      params,
    );
    const counts = new Map<string, number>(ENTITY_TYPE_KEYS.map((t) => [t, 0]));
    for (const { type, count } of rows) {
      // Presidio types outside the catalogue keep their own name.
      const key = ENTITY_TYPE_BY_PRESIDIO.get(type) ?? type;
      counts.set(key, (counts.get(key) ?? 0) + count);
    }
    return [...counts]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * How many detected entities each method processed. HIPAA analyses apply
   * one output mode to all; risk-level analyses pick a method per type.
   */
  private async methods(params: unknown[]) {
    const rows: { method: string; count: number }[] = await this.db.query(
      `SELECT output_mode AS method, sum(detected_count)::int AS count
         FROM analyses a
        WHERE ${scope('a')} AND a.entity_methods IS NULL
        GROUP BY output_mode
       UNION ALL
       SELECT a.entity_methods ->> m.type AS method,
              sum(c.value::int)::int AS count
         FROM analyses a
        CROSS JOIN jsonb_each_text(a.entity_counts) c
         JOIN jsonb_each_text($5::jsonb) AS m(presidio, type)
           ON m.presidio = c.key
        WHERE ${scope('a')} AND a.entity_methods IS NOT NULL
        GROUP BY 1`,
      [...params, PRESIDIO_TO_ENTITY_TYPE],
    );
    const counts = new Map<string, number>(
      Object.values(EntityMethod).map((m) => [m, 0]),
    );
    for (const { method, count } of rows) {
      const key = OUTPUT_MODE_METHOD[method as OutputMode] ?? method;
      if (key) counts.set(key, (counts.get(key) ?? 0) + count);
    }
    return [...counts].map(([method, count]) => ({ method, count }));
  }
}

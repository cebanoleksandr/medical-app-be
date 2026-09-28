import {
  col,
  ColumnDefinition,
  DatasetDefinition,
  SourceDatasetType,
} from '../datasets/types';
import { CellValue, RecordContext, SyntheticRecord } from '../generator';
import { ageBand } from '../reference/regions';
import { ColumnProfile, FileProfile, OTHER } from './profiler';

const DAY_MS = 86_400_000;

/** Uniform draw inside a random decile: stays within the learned 5th–95th range. */
function fromDeciles(ctx: RecordContext, q: number[]): number {
  const i = ctx.int(0, 9);
  return q[i] + (q[i + 1] - q[i]) * ctx.rng.next();
}

function columnType(p: ColumnProfile): ColumnDefinition['type'] {
  switch (p.kind) {
    case 'number':
      return 'number';
    case 'date':
      return 'date';
    case 'boolean':
      return 'boolean';
    default:
      return 'string';
  }
}

function sample(ctx: RecordContext, p: ColumnProfile): SyntheticRecord[string] {
  if (p.kind === 'identifier') {
    return `SYN-${p.prefix}-${String(ctx.index + 1).padStart(5, '0')}`;
  }
  if (ctx.chance(p.missing)) return null;
  switch (p.kind) {
    case 'number': {
      const factor = 10 ** p.decimals;
      return Math.round(fromDeciles(ctx, p.quantiles) * factor) / factor;
    }
    case 'date':
      return new Date(Math.round(fromDeciles(ctx, p.quantiles)) * DAY_MS)
        .toISOString()
        .slice(0, 10);
    case 'age':
      return ageBand(Math.max(18, Math.floor(fromDeciles(ctx, p.quantiles))));
    case 'boolean':
      return ctx.chance(p.pTrue);
    case 'category':
      return ctx.rng.weighted([
        ...p.values.map(({ value, weight }) => ({ weight, value })),
        { weight: p.otherWeight, value: OTHER },
      ]);
  }
}

/** Records drawn column by column from the learned marginal distributions. */
export function fileDataset(profile: FileProfile): DatasetDefinition {
  const recordIdKey = profile.columns.some((c) => c.key === 'record_id')
    ? 'synthetic_record_id'
    : 'record_id';
  const columns = [
    col(recordIdKey, 'Record ID', 'string', 'id'),
    ...profile.columns.map((p) =>
      col(
        p.key,
        p.key,
        columnType(p),
        p.kind === 'identifier' ? 'id' : undefined,
      ),
    ),
  ];
  const byKey = new Map(profile.columns.map((p) => [p.key, p]));

  return {
    id: SourceDatasetType.FROM_FILE,
    name: 'From uploaded file',
    description: 'Synthetic records with the statistics of an uploaded table',
    recordsPerPatient: 1,
    previewColumns: columns.slice(0, 5).map((c) => c.key),
    columns,
    generate(ctx) {
      const record: SyntheticRecord = { [recordIdKey]: ctx.id };
      for (const p of profile.columns) record[p.key] = sample(ctx, p);
      return record;
    },
    distribution(key) {
      const p = byKey.get(key);
      switch (p?.kind) {
        case 'category':
          return {
            expected: new Map([
              ...p.values.map((v) => [v.value, v.weight] as [string, number]),
              [OTHER, p.otherWeight],
            ]),
            bucket: String,
          };
        case 'boolean':
          return {
            expected: new Map([
              ['true', p.pTrue],
              ['false', 1 - p.pTrue],
            ]),
            bucket: String,
          };
        case 'number':
        case 'date': {
          // Draws are uniform over deciles, so each should hold 10%. Discrete
          // columns (repeated deciles) can't be bucketed that way; skip them.
          const q = p.quantiles;
          if (new Set(q).size < q.length) return null;
          const toNumber = (v: CellValue) =>
            p.kind === 'date' ? Date.parse(String(v)) / DAY_MS : Number(v);
          return {
            expected: new Map(
              Array.from({ length: 10 }, (_, i) => [String(i), 0.1]),
            ),
            bucket: (v) => {
              const n = toNumber(v);
              let i = 0;
              while (i < 9 && n >= q[i + 1]) i++;
              return String(i);
            },
          };
        }
        default:
          return null;
      }
    },
    checkRecord(record) {
      const issues: string[] = [];
      for (const [key, value] of Object.entries(record)) {
        const p = byKey.get(key);
        if (!p || value === null) continue;
        if (p.kind === 'number' || p.kind === 'date') {
          const n =
            p.kind === 'date'
              ? Date.parse(String(value)) / DAY_MS
              : Number(value);
          const [min, max] = [p.quantiles[0], p.quantiles[10]];
          // Rounding can nudge a value just past the learned range.
          const slack = Math.max(1, (max - min) * 0.001);
          if (!(n >= min - slack && n <= max + slack)) {
            issues.push(`${key} is outside the source's range`);
          }
        }
        if (
          p.kind === 'category' &&
          value !== OTHER &&
          !p.values.some((v) => v.value === value)
        ) {
          issues.push(`${key} has a value the source doesn't contain`);
        }
      }
      return issues;
    },
  };
}

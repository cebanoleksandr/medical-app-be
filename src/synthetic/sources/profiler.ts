import { Table } from './tabular';

/** Categories seen fewer times than this are merged into "Other". */
export const K_MIN = 5;
/** Deciles between these percentiles; tails are dropped so outliers can't leak. */
const LOW_PCT = 0.05;
const HIGH_PCT = 0.95;
const TYPE_CONFORMANCE = 0.95;
const IDENTIFIER_HIT_RATE = 0.3;
const SCAN_SAMPLE = 30;
export const OTHER = 'Other';

export type ColumnProfile =
  | { key: string; kind: 'identifier'; prefix: string }
  | {
      key: string;
      kind: 'number';
      missing: number;
      quantiles: number[];
      decimals: number;
    }
  | { key: string; kind: 'date'; missing: number; quantiles: number[] }
  | { key: string; kind: 'age'; missing: number; quantiles: number[] }
  | { key: string; kind: 'boolean'; missing: number; pTrue: number }
  | {
      key: string;
      kind: 'category';
      missing: number;
      values: { value: string; weight: number }[];
      otherWeight: number;
    };

export interface ColumnSummary {
  key: string;
  kind: ColumnProfile['kind'] | 'excluded';
  /** Why the column was replaced or dropped. */
  reason?: string;
  lowConfidence: string[];
}

export interface FileProfile {
  columns: ColumnProfile[];
  rowCount: number;
}

/** Returns, per value, whether it contains a direct identifier. */
export type IdentifierDetector = (values: string[]) => Promise<boolean[]>;

const IDENTIFIER_NAME =
  /(^|[^a-z])(name|surname|first.?name|last.?name|full.?name|patient|email|e-?mail|phone|tel|mobile|fax|ssn|social.?sec|address|street|zip|post.?code|postal|mrn|medical.?record|record.?(id|no|number)|account|iban|card|passport|licen[cs]e|ip.?addr|url|website|id)([^a-z]|$)|піб|прізвищ|ім'я|імя|телефон|адрес|пошт|рнокпп|іпн|паспорт|картк/i;
const BIRTH_NAME = /birth|dob|народж/i;
const NUMBER = /^-?\d+([.,]\d+)?$/;
const BOOLEAN = new Set(['true', 'false', 'yes', 'no', 'y', 'n', 'так', 'ні']);
const TRUE = new Set(['true', 'yes', 'y', 'так', '1']);
const DAY_MS = 86_400_000;

export function parseDate(value: string): number | null {
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})([T ].*)?$/.exec(value);
  if (match) [y, m, d] = [+match[1], +match[2], +match[3]];
  else if ((match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value))) {
    [d, m, y] = [+match[1], +match[2], +match[3]];
  } else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value))) {
    // US order unless the first part can only be a day.
    [m, d, y] =
      +match[1] > 12
        ? [+match[2], +match[1], +match[3]]
        : [+match[1], +match[2], +match[3]];
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

function deciles(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => {
    const pos = p * (sorted.length - 1);
    const lo = Math.floor(pos);
    return sorted[lo] + (sorted[Math.ceil(pos)] - sorted[lo]) * (pos - lo);
  };
  return Array.from({ length: 11 }, (_, i) =>
    at(LOW_PCT + ((HIGH_PCT - LOW_PCT) * i) / 10),
  );
}

const conformance = (values: string[], test: (v: string) => boolean) =>
  values.length ? values.filter(test).length / values.length : 0;

const prefixFor = (key: string) =>
  key
    .normalize('NFKD')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 4)
    .toUpperCase() || 'ID';

interface Draft {
  key: string;
  values: string[];
  missing: number;
  kind: ColumnSummary['kind'] | 'text-candidate';
  reason?: string;
  lowConfidence: string[];
}

/**
 * Learns per-column statistics safe to keep: no row, no rare value and no
 * identifier survives. Correlations between columns are not modelled.
 */
export async function profileTable(
  table: Table,
  detect: IdentifierDetector,
  now = new Date(),
): Promise<{ profile: FileProfile; summary: ColumnSummary[] }> {
  const rowCount = table.rows.length;
  const drafts: Draft[] = table.columns.map((key, i) => {
    const values = table.rows
      .map((r) => r[i])
      .filter((v): v is string => v !== null);
    const missing = 1 - values.length / rowCount;
    const draft: Draft = {
      key,
      values,
      missing,
      kind: 'text-candidate',
      lowConfidence: [],
    };
    if (missing > 0.3)
      draft.lowConfidence.push(
        `${Math.round(missing * 100)}% of values are empty`,
      );

    if (!values.length)
      return { ...draft, kind: 'excluded', reason: 'column is empty' };

    const dateRate = conformance(values, (v) => parseDate(v) !== null);
    if (BIRTH_NAME.test(key) && dateRate >= TYPE_CONFORMANCE) {
      return {
        ...draft,
        kind: 'age',
        reason: 'birth dates are generalized to age ranges',
      };
    }
    if (IDENTIFIER_NAME.test(key)) {
      return {
        ...draft,
        kind: 'identifier',
        reason: 'column name suggests an identifier',
      };
    }

    const lowered = values.map((v) => v.toLowerCase());
    const distinct = new Set(lowered);
    if (
      distinct.size <= 2 &&
      lowered.every((v) => BOOLEAN.has(v) || v === '0' || v === '1')
    ) {
      return { ...draft, kind: 'boolean' };
    }
    // Leading zeros mean a code (ZIP, ID), not a quantity.
    const numberRate = conformance(
      values,
      (v) => NUMBER.test(v) && !/^-?0\d/.test(v),
    );
    if (numberRate >= TYPE_CONFORMANCE)
      return typed(draft, 'number', numberRate);
    if (dateRate >= TYPE_CONFORMANCE) return typed(draft, 'date', dateRate);

    const avgLength = values.reduce((s, v) => s + v.length, 0) / values.length;
    if (avgLength > 60) {
      return {
        ...draft,
        kind: 'excluded',
        reason: 'free text cannot be synthesized safely',
      };
    }
    if (distinct.size / values.length > 0.5 && distinct.size > 20) {
      return {
        ...draft,
        kind: 'identifier',
        reason: 'values are mostly unique',
      };
    }
    return draft; // category, pending the identifier scan
  });

  // One detector call: a sample of each category column plus every category
  // value frequent enough to be kept.
  const queries: { draft: Draft; value: string; sample: boolean }[] = [];
  for (const draft of drafts.filter((d) => d.kind === 'text-candidate')) {
    for (const value of draft.values.slice(0, SCAN_SAMPLE))
      queries.push({ draft, value, sample: true });
    for (const [value, count] of countValues(draft.values)) {
      if (count >= K_MIN) queries.push({ draft, value, sample: false });
    }
  }
  const hits = queries.length ? await detect(queries.map((q) => q.value)) : [];
  const flagged = new Map<Draft, Set<string>>();
  const sampleHits = new Map<Draft, number[]>();
  queries.forEach((q, i) => {
    if (q.sample) {
      const [hit, total] = sampleHits.get(q.draft) ?? [0, 0];
      sampleHits.set(q.draft, [hit + Number(hits[i]), total + 1]);
    } else if (hits[i]) {
      flagged.set(q.draft, (flagged.get(q.draft) ?? new Set()).add(q.value));
    }
  });

  const columns: ColumnProfile[] = [];
  const summary: ColumnSummary[] = [];
  for (const draft of drafts) {
    if (draft.kind === 'text-candidate') {
      const [hit, total] = sampleHits.get(draft) ?? [0, 1];
      if (hit / total >= IDENTIFIER_HIT_RATE) {
        draft.kind = 'identifier';
        draft.reason = 'values contain personal identifiers';
      }
    }
    const profile = buildProfile(draft, flagged.get(draft) ?? new Set(), now);
    if (profile) columns.push(profile);
    summary.push({
      key: draft.key,
      kind: profile ? profile.kind : 'excluded',
      ...(draft.reason ? { reason: draft.reason } : {}),
      lowConfidence: draft.lowConfidence,
    });
  }
  return { profile: { columns, rowCount }, summary };
}

function typed(draft: Draft, kind: 'number' | 'date', rate: number): Draft {
  if (rate < 1) {
    draft.lowConfidence.push(
      `${Math.round((1 - rate) * 100)}% of values didn't match the ${kind} type and were dropped`,
    );
  }
  return { ...draft, kind };
}

function countValues(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return counts;
}

function buildProfile(
  draft: Draft,
  flagged: Set<string>,
  now: Date,
): ColumnProfile | null {
  const { key, values, missing } = draft;
  const few = (n: number) => {
    if (n < 30) draft.lowConfidence.push(`only ${n} values to learn from`);
  };

  switch (draft.kind) {
    case 'identifier':
      return { key, kind: 'identifier', prefix: prefixFor(key) };
    case 'excluded':
      return null;
    case 'boolean': {
      const pTrue =
        values.filter((v) => TRUE.has(v.toLowerCase())).length / values.length;
      return { key, kind: 'boolean', missing, pTrue };
    }
    case 'number': {
      const numbers = values
        .filter((v) => NUMBER.test(v))
        .map((v) => Number(v.replace(',', '.')));
      few(numbers.length);
      const decimals = Math.min(
        4,
        Math.max(0, ...values.map((v) => (v.split(/[.,]/)[1] ?? '').length)),
      );
      return {
        key,
        kind: 'number',
        missing,
        quantiles: deciles(numbers),
        decimals,
      };
    }
    case 'date': {
      const days = values.map(parseDate).filter((d): d is number => d !== null);
      few(days.length);
      return { key, kind: 'date', missing, quantiles: deciles(days) };
    }
    case 'age': {
      const today = Math.floor(now.getTime() / DAY_MS);
      const ages = values
        .map(parseDate)
        .filter((d): d is number => d !== null)
        .map((d) => (today - d) / 365.25)
        .filter((a) => a >= 0 && a < 120);
      few(ages.length);
      return { key, kind: 'age', missing, quantiles: deciles(ages) };
    }
    default: {
      const kept: { value: string; weight: number }[] = [];
      let other = 0;
      for (const [value, count] of countValues(values)) {
        if (count >= K_MIN && !flagged.has(value))
          kept.push({ value, weight: count / values.length });
        else other += count / values.length;
      }
      if (!kept.length) {
        draft.reason = 'every value is too rare to keep';
        return { key, kind: 'identifier', prefix: prefixFor(key) };
      }
      if (other > 0.2) {
        draft.lowConfidence.push(
          `${Math.round(other * 100)}% of values were rare and merged into "${OTHER}"`,
        );
      }
      if (flagged.size) {
        draft.lowConfidence.push(
          `${flagged.size} values looked like identifiers and were removed`,
        );
      }
      return {
        key,
        kind: 'category',
        missing,
        values: kept,
        otherWeight: other,
      };
    }
  }
}

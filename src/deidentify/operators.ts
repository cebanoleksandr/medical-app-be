import { base, en, Faker, uk } from '@faker-js/faker';
import { createHmac } from 'crypto';
import { RngRandomizer } from '../common/rng';
import { EntityMethod } from './catalog/entities';
import { AnalysisLanguage } from './presidio.client';

export enum OutputMode {
  /** `[REDACTED]` */
  REDACT = 'REDACT',
  /** `***-**-****`: same shape, characters hidden. */
  MASK = 'MASK',
  /** `[PERSON_1]`: numbered per type, same value → same number. */
  PLACEHOLDER = 'PLACEHOLDER',
  /** Realistic fake value, stable for the same value within one analysis. */
  PSEUDONYMIZE = 'PSEUDONYMIZE',
}

export const OUTPUT_MODES = [
  {
    id: OutputMode.REDACT,
    name: 'Redact — Remove entirely',
    description: 'Replaces detected data with [REDACTED]',
  },
  {
    id: OutputMode.MASK,
    name: 'Mask — Hide characters',
    description: 'Keeps the format, replaces characters with *',
  },
  {
    id: OutputMode.PLACEHOLDER,
    name: 'Placeholder — Entity label',
    description: 'Replaces data with numbered labels such as [PATIENT_1]',
  },
  {
    id: OutputMode.PSEUDONYMIZE,
    name: 'Pseudonymize — Realistic fake data',
    description: 'Replaces data with consistent, realistic fake values',
  },
];

export const REDACTED = '[REDACTED]';

const PLACEHOLDER_LABELS: Record<string, string> = {
  PERSON: 'PATIENT',
  DATE_TIME: 'DATE',
  PHONE_NUMBER: 'PHONE',
  EMAIL_ADDRESS: 'EMAIL',
  MEDICAL_RECORD_NUMBER: 'MRN',
  HEALTH_PLAN_ID: 'HEALTH_PLAN',
  IP_ADDRESS: 'IP',
  ORGANIZATION: 'ORG',
  GENERIC_ID: 'ID',
};

export interface ReplacementTarget {
  type: string;
  value: string;
}

export interface ReplacementContext {
  mode: OutputMode;
  language: AnalysisLanguage;
  /** Scopes pseudonyms: the same value maps to the same fake in one analysis. */
  analysisId: string;
  pseudonymSecret: string;
}

/** Returns one replacement string per target, in the same order. */
export function buildReplacements(
  targets: ReplacementTarget[],
  ctx: ReplacementContext,
): string[] {
  switch (ctx.mode) {
    case OutputMode.REDACT:
      return targets.map(() => REDACTED);
    case OutputMode.MASK:
      return targets.map((t) => t.value.replace(/[\p{L}\p{N}]/gu, '*'));
    case OutputMode.PLACEHOLDER:
      return placeholders(targets);
    case OutputMode.PSEUDONYMIZE:
      return targets.map((t) => pseudonym(t, ctx));
  }
}

const normalize = (value: string) =>
  value.toLowerCase().replace(/\s+/g, ' ').trim();

function placeholders(targets: ReplacementTarget[]): string[] {
  const numbers = new Map<string, number>();
  const counters = new Map<string, number>();

  return targets.map(({ type, value }) => {
    const label = PLACEHOLDER_LABELS[type] ?? type;
    const key = `${label}|${normalize(value)}`;
    if (!numbers.has(key)) {
      const next = (counters.get(label) ?? 0) + 1;
      counters.set(label, next);
      numbers.set(key, next);
    }
    return `[${label}_${numbers.get(key)}]`;
  });
}

const fakers: Record<AnalysisLanguage, Faker> = {
  en: new Faker({ locale: [en, base], randomizer: new RngRandomizer() }),
  uk: new Faker({ locale: [uk, en, base], randomizer: new RngRandomizer() }),
};

/** A Faker for `language`, reseeded; valid until the next call for that language. */
export function seededFaker(language: AnalysisLanguage, seed: number[]): Faker {
  const faker = fakers[language];
  faker.seed(seed);
  return faker;
}

/**
 * Seeded by an HMAC of the value, so a pseudonym is stable across re-renders
 * without storing anything, and can't be reversed by guessing candidate
 * values without the server secret.
 */
function pseudonym(
  { type, value }: ReplacementTarget,
  ctx: Omit<ReplacementContext, 'mode'>,
): string {
  const digest = createHmac('sha256', ctx.pseudonymSecret)
    .update(`${ctx.analysisId}|${type}|${normalize(value)}`)
    .digest();
  const faker = seededFaker(
    ctx.language,
    [0, 4, 8, 12].map((offset) => digest.readUInt32BE(offset)),
  );
  return fakeValue(type, value, ctx.language, faker);
}

/**
 * Realistic stand-in for an entity. `value` only matters for its shape
 * (digits/letters/separators), which identifiers keep.
 */
export function fakeValue(
  type: string,
  value: string,
  language: AnalysisLanguage,
  faker: Faker,
): string {
  switch (type) {
    case 'PERSON':
      return faker.person.fullName();
    case 'LOCATION':
      return /\d/.test(value)
        ? faker.location.streetAddress()
        : faker.location.city();
    case 'DATE_TIME': {
      const date = faker.date.between({ from: '1940-01-01', to: '2025-12-31' });
      const [y, m, d] = date.toISOString().slice(0, 10).split('-');
      return language === 'uk' ? `${d}.${m}.${y}` : `${m}/${d}/${y}`;
    }
    case 'EMAIL_ADDRESS':
      return (
        faker.internet.username({ firstName: 'user' }).toLowerCase() +
        '@example.com'
      );
    case 'URL':
      return `https://example.com/${faker.string.alphanumeric(8).toLowerCase()}`;
    case 'IP_ADDRESS':
      return faker.internet.ipv4();
    case 'ORGANIZATION':
      return faker.company.name();
    case 'NRP':
      return REDACTED;
    default:
      return preserveFormat(value, faker);
  }
}

/** Random digits/letters in the original's shape: `429-18-7734` → `813-40-2296`. */
function preserveFormat(value: string, faker: Faker): string {
  return value.replace(/[\p{L}\p{N}]/gu, (ch) => {
    if (/\d/.test(ch)) return String(faker.number.int(9));
    const letter = faker.string.alpha({ length: 1, casing: 'upper' });
    return ch === ch.toLowerCase() ? letter.toLowerCase() : letter;
  });
}

// ---------- Per-entity methods (GDPR, UK GDPR, FADP) ----------

export interface EntityTarget extends ReplacementTarget {
  method: EntityMethod;
}

export type EntityReplacementContext = Omit<ReplacementContext, 'mode'>;

/**
 * One replacement per target, each with its own method. Placeholders are
 * numbered across all PLACEHOLDER targets, as in the PLACEHOLDER mode.
 */
export function buildEntityReplacements(
  targets: EntityTarget[],
  ctx: EntityReplacementContext,
): string[] {
  const placeholderIndexes = targets
    .map((t, i) => (t.method === EntityMethod.PLACEHOLDER ? i : -1))
    .filter((i) => i >= 0);
  const numbered = placeholders(placeholderIndexes.map((i) => targets[i]));
  const placeholderByIndex = new Map(
    placeholderIndexes.map((index, n) => [index, numbered[n]]),
  );

  return targets.map((target, i) => {
    switch (target.method) {
      case EntityMethod.REDACT:
      case EntityMethod.NLP_REDACTION:
        return REDACTED;
      case EntityMethod.PLACEHOLDER:
        return placeholderByIndex.get(i)!;
      case EntityMethod.SYNTHETIC:
        return pseudonym(target, ctx);
      case EntityMethod.TOKEN:
        return `${labelOf(target.type)}_${keyedDigest(target, ctx, 'token').slice(0, 6).toUpperCase()}`;
      case EntityMethod.PSEUDONYMISE:
        return `PSN-${keyedDigest(target, ctx, 'pseudonym').slice(0, 10).toUpperCase()}`;
      case EntityMethod.HASH:
        return hashValue(target, ctx.pseudonymSecret);
      case EntityMethod.MASK:
        return maskPartially(target.value);
      case EntityMethod.GENERALISE:
        return generalise(target, ctx.language);
    }
  });
}

const labelOf = (type: string) => PLACEHOLDER_LABELS[type] ?? type;

/**
 * Stable within one analysis, like pseudonyms: re-rendering gives the same
 * token, other analyses get different ones. Nothing is stored, so tokens
 * can't be mapped back; the server secret prevents guessing them.
 */
function keyedDigest(
  { type, value }: ReplacementTarget,
  ctx: EntityReplacementContext,
  purpose: string,
): string {
  return createHmac('sha256', ctx.pseudonymSecret)
    .update(`${purpose}|${ctx.analysisId}|${type}|${normalize(value)}`)
    .digest('hex');
}

/**
 * Keyed one-way hash, the same across analyses so equal values stay
 * linkable (that is what HASH is for); irreversible without the secret.
 */
function hashValue({ type, value }: ReplacementTarget, secret: string): string {
  const digest = createHmac('sha256', secret)
    .update(`hash|${type}|${normalize(value)}`)
    .digest('hex');
  return `#${digest.slice(0, 16)}`;
}

/**
 * Hides most characters but keeps the shape and a hint of what it was:
 * an email's domain, the last 4 digits of a number, each word's initial.
 */
export function maskPartially(value: string): string {
  const at = value.lastIndexOf('@');
  if (at > 0) {
    return maskChars(value.slice(0, at), (i) => i === 0) + value.slice(at);
  }
  const digits = value.replace(/\D/g, '').length;
  if (digits >= 6) {
    const alnum = [...value.matchAll(/[\p{L}\p{N}]/gu)].map((m) => m.index);
    const keep = new Set(alnum.slice(-4));
    return maskChars(value, (i) => keep.has(i));
  }
  return maskChars(
    value,
    (i) => i === 0 || !/[\p{L}\p{N}]/u.test(value[i - 1]),
  );
}

/** Replaces letters and digits with `*` except where `keep(index)`. */
function maskChars(value: string, keep: (index: number) => boolean): string {
  return [...value]
    .map((ch, i) => (/[\p{L}\p{N}]/u.test(ch) && !keep(i) ? '*' : ch))
    .join('');
}

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

/** Coarser value of the same kind: quarter of a date, /24 of an IP… */
export function generalise(
  { type, value }: ReplacementTarget,
  language: AnalysisLanguage,
): string {
  switch (type) {
    case 'DATE_TIME':
      return generaliseDate(value, language);
    case 'IP_ADDRESS':
      return generaliseIp(value);
    case 'LOCATION':
      return generaliseLocation(value);
    default:
      return `[${labelOf(type)}]`;
  }
}

/** "03/14/2026" → "Q1 2026"; "2026" stays; no year → "[DATE]". */
function generaliseDate(value: string, language: AnalysisLanguage): string {
  const year = value.match(/\b(1[89]\d\d|20\d\d)\b/)?.[1];
  if (!year) return '[DATE]';

  let month: number | undefined;
  const numeric = value.match(/\b(\d{1,2})[./-](\d{1,2})[./-]\d{2,4}\b/);
  if (numeric) {
    // US text writes the month first; Ukrainian the day.
    month = Number(language === 'uk' ? numeric[2] : numeric[1]);
  } else {
    const name = value
      .toLowerCase()
      .match(/[a-z]{3,}/g)
      ?.find((word) => MONTHS.includes(word.slice(0, 3)));
    if (name) month = MONTHS.indexOf(name.slice(0, 3)) + 1;
  }
  if (!month || month > 12) return year;
  return `Q${Math.ceil(month / 3)} ${year}`;
}

/** Keeps the network: "192.168.4.27" → "192.168.4.0/24". */
function generaliseIp(value: string): string {
  const v4 = value.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.0/24`;
  if (value.includes(':')) {
    return `${value.split(':').slice(0, 3).join(':')}::/48`;
  }
  return '[IP]';
}

/**
 * Drops the street and shortens postcodes:
 * "1500 Lake Shore Dr, Chicago, IL 60601" → "Chicago, IL 606XX".
 * A place without a street (a city) is already coarse and stays.
 */
function generaliseLocation(value: string): string {
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const region =
    parts.length > 1 && /\d/.test(parts[0]) ? parts.slice(1) : parts;
  const text = region.join(', ').replace(/\b(\d{3})\d{2}(-\d{4})?\b/g, '$1XX');
  // A lone street address has nothing coarser to keep.
  return /^\d/.test(text) ? '[LOCATION]' : text;
}

import { base, en, Faker, uk } from '@faker-js/faker';
import { createHmac } from 'crypto';
import { RngRandomizer } from '../common/rng';
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
  ctx: ReplacementContext,
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

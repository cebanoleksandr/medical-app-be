import { Framework } from '../deidentify/catalog/frameworks';
import { Language, Localized } from './reference/localized';
import { DIAGNOSES, Diagnosis, Sex } from './reference/medical';
import { ageBand, REGIONS } from './reference/regions';
import { Rng } from '../common/rng';

export type CellValue = string | number | boolean | null;
export type SyntheticRecord = Record<string, CellValue>;

export interface GenerationParams {
  framework: Framework;
  language: Language;
  seed: number;
  /** Dates are generated in the year before this moment. */
  referenceDate: Date;
}

export interface PatientProfile {
  ref: string;
  sex: Sex;
  age: number;
  ageBand: string;
  region: string;
  diagnosis: Diagnosis;
  secondary: Diagnosis | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// Separate streams so patient and record draws never collide.
const RECORD_STREAM = 1;
const PATIENT_STREAM = 2;

export const recordId = (index: number) =>
  `SYN-${String(index + 1).padStart(5, '0')}`;

/** `SYN-00042` → 41, or null if it isn't a record id. */
export function parseRecordId(id: string): number | null {
  const match = /^SYN-(\d{5,})$/.exec(id);
  return match ? Number(match[1]) - 1 : null;
}

/**
 * Everything one record may draw from. Record `index` is a pure function of
 * (params, index), so any record can be regenerated on demand without storing
 * the dataset.
 */
export class RecordContext {
  readonly rng: Rng;
  readonly id: string;
  private cachedPatient?: PatientProfile;

  constructor(
    readonly params: GenerationParams,
    readonly index: number,
    private readonly recordsPerPatient: number,
  ) {
    this.rng = new Rng(params.seed, RECORD_STREAM, index);
    this.id = recordId(index);
  }

  t(text: Localized): string {
    return text[this.params.language];
  }

  /** Records of the same patient share sex, age, region and diagnoses. */
  get patient(): PatientProfile {
    this.cachedPatient ??= buildPatient(
      this.params,
      Math.floor(this.index / this.recordsPerPatient),
    );
    return this.cachedPatient;
  }

  /** ISO date `daysAgoMin`–`daysAgoMax` days before the reference date. */
  date(daysAgoMax = 365, daysAgoMin = 0): string {
    const daysAgo = this.rng.int(daysAgoMin, daysAgoMax);
    const time = this.params.referenceDate.getTime() - daysAgo * DAY_MS;
    return new Date(time).toISOString().slice(0, 10);
  }

  pick<T>(items: readonly T[]): T {
    return this.rng.pick(items);
  }

  chance(probability: number): boolean {
    return this.rng.chance(probability);
  }

  int(min: number, max: number): number {
    return this.rng.int(min, max);
  }

  float(min: number, max: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(this.rng.float(min, max) * factor) / factor;
  }

  /** `500 mg` → `500 мг` for Ukrainian. */
  strength(value: string): string {
    if (this.params.language !== 'uk') return value;
    return value
      .replace(/\bmcg\b/g, 'мкг')
      .replace(/\bmg\b/g, 'мг')
      .replace(/\bg\b/g, 'г')
      .replace(/\/dose\b/g, '/доза');
  }
}

function buildPatient(
  params: GenerationParams,
  patientIndex: number,
): PatientProfile {
  const rng = new Rng(params.seed, PATIENT_STREAM, patientIndex);
  const pickDiagnosis = (sex?: Sex) =>
    rng.weighted(
      DIAGNOSES.filter((d) => !d.sex || !sex || d.sex === sex).map((d) => ({
        weight: d.weight,
        value: d,
      })),
    );

  const diagnosis = pickDiagnosis();
  const sex: Sex = diagnosis.sex ?? rng.pick<Sex>(['M', 'F']);
  const age = rng.int(Math.max(18, diagnosis.ages[0]), diagnosis.ages[1]);
  const secondary = rng.chance(0.45) ? pickDiagnosis(sex) : null;

  return {
    ref: `SYN-P-${String(patientIndex + 1).padStart(5, '0')}`,
    sex,
    age,
    ageBand: ageBand(age),
    region: rng.pick(REGIONS[params.framework])[params.language],
    diagnosis,
    secondary: secondary?.icd10 === diagnosis.icd10 ? null : secondary,
  };
}

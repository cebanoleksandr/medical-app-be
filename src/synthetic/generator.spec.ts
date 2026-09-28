import { Framework } from '../deidentify/catalog/frameworks';
import { DATASETS, DatasetType, generateRecord } from './datasets';
import { GenerationParams, parseRecordId, recordId } from './generator';
import { DIAGNOSES } from './reference/medical';
import { ageBand, REGIONS } from './reference/regions';

const params = (extra: Partial<GenerationParams> = {}): GenerationParams => ({
  framework: Framework.HIPAA,
  language: 'en',
  seed: 42,
  referenceDate: new Date('2026-09-28T12:00:00Z'),
  ...extra,
});

const sample = (type: DatasetType, n: number, p = params()) =>
  Array.from({ length: n }, (_, i) => generateRecord(DATASETS[type], p, i));

describe('ageBand', () => {
  it.each([
    [18, '18-24'],
    [24, '18-24'],
    [25, '25-34'],
    [64, '55-64'],
    [85, '85-89'],
    [89, '85-89'],
    [90, '90+'],
    [104, '90+'],
  ])('%i → %s', (age, band) => expect(ageBand(age)).toBe(band));
});

describe('record ids', () => {
  it('round-trips', () => {
    expect(recordId(40)).toBe('SYN-00041');
    expect(parseRecordId('SYN-00041')).toBe(40);
    expect(parseRecordId(recordId(123_456))).toBe(123_456);
    expect(parseRecordId('SYN-41')).toBeNull();
    expect(parseRecordId('abc')).toBeNull();
  });
});

describe('generateRecord', () => {
  it.each(Object.values(DatasetType))(
    '%s returns exactly the declared columns',
    (type) => {
      const keys = DATASETS[type].columns.map((c) => c.key);
      for (const record of sample(type, 50)) {
        expect(Object.keys(record)).toEqual(keys);
      }
    },
  );

  it('is deterministic per seed and index', () => {
    const a = generateRecord(DATASETS.CLINICAL_NOTES, params(), 7);
    expect(generateRecord(DATASETS.CLINICAL_NOTES, params(), 7)).toEqual(a);
    expect(
      generateRecord(DATASETS.CLINICAL_NOTES, params({ seed: 43 }), 7),
    ).not.toEqual(a);
  });

  it.each(Object.values(DatasetType))(
    '%s passes its own consistency checks',
    (type) => {
      for (const record of sample(type, 2000)) {
        expect(DATASETS[type].checkRecord(record)).toEqual([]);
      }
    },
  );

  it('keeps a patient consistent across their records', () => {
    const labs = sample(DatasetType.LAB_RESULTS, 400);
    const byPatient = new Map<string, Set<string>>();
    for (const r of labs) {
      const key = String(r.patient_ref);
      byPatient.set(key, byPatient.get(key) ?? new Set());
      byPatient.get(key).add(`${r.sex}|${r.age_range}|${r.diagnosis_code}`);
    }
    expect(byPatient.size).toBe(100);
    for (const profiles of byPatient.values()) expect(profiles.size).toBe(1);
  });

  it('respects sex-specific diagnoses', () => {
    const femaleOnly = new Set(
      DIAGNOSES.filter((d) => d.sex === 'F').map((d) => d.icd10),
    );
    const maleOnly = new Set(
      DIAGNOSES.filter((d) => d.sex === 'M').map((d) => d.icd10),
    );
    for (const r of sample(DatasetType.PATIENT_RECORDS, 2000)) {
      for (const code of [
        r.primary_diagnosis_code,
        r.secondary_diagnosis_code,
      ]) {
        if (femaleOnly.has(String(code))) expect(r.sex).toBe('F');
        if (maleOnly.has(String(code))) expect(r.sex).toBe('M');
      }
    }
  });

  it('flags lab values against their reference range', () => {
    for (const r of sample(DatasetType.LAB_RESULTS, 1000)) {
      const value = Number(r.value);
      const expected =
        value < Number(r.reference_low)
          ? 'L'
          : value > Number(r.reference_high)
            ? 'H'
            : 'N';
      expect(r.flag).toBe(expected);
    }
  });

  it('dates fall within the year before the reference date', () => {
    for (const r of sample(DatasetType.PRESCRIPTIONS, 500)) {
      expect(r.prescribed_date >= '2025-09-28').toBe(true);
      expect(r.prescribed_date <= '2026-09-28').toBe(true);
    }
    for (const r of sample(DatasetType.PATIENT_RECORDS, 2000)) {
      expect(r.discharge_date <= '2026-09-28').toBe(true);
    }
  });

  it('never goes below state level and uses the framework region list', () => {
    const regions = new Set(REGIONS[Framework.SWISS_FADP].map((r) => r.en));
    for (const r of sample(
      DatasetType.PATIENT_RECORDS,
      300,
      params({ framework: Framework.SWISS_FADP }),
    )) {
      expect(regions.has(String(r.region))).toBe(true);
    }
  });

  it('writes Ukrainian content for Ukrainian datasets', () => {
    const [note] = sample(
      DatasetType.CLINICAL_NOTES,
      1,
      params({ language: 'uk' }),
    );
    expect(note.note_text).toMatch(/[а-яіїєґ]/i);
    expect(note.note_text).not.toMatch(/\(ий\)/);
  });
});

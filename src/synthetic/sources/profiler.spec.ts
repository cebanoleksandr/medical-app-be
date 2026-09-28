import { generateRecord } from '../datasets';
import { Framework } from '../../deidentify/catalog/frameworks';
import { fileDataset } from './file-dataset';
import { ColumnProfile, OTHER, parseDate, profileTable } from './profiler';
import { Table } from './tabular';

const ROWS = 200;
const DIAGNOSES = ['Hypertension', 'Diabetes', 'Asthma', 'Migraine'];

/** Deterministic table with every kind of column the profiler handles. */
function makeTable(): Table {
  const columns = [
    'patient_name',
    'contact',
    'age_years',
    'sex',
    'diagnosis',
    'city',
    'visit_date',
    'date_of_birth',
    'smoker',
    'notes',
    'lab_code',
  ];
  const rows = Array.from({ length: ROWS }, (_, i) => [
    `Patient Number${i}`,
    `person${i}@mail.com`,
    i === 0 ? '999' : String(20 + (i % 60)), // one extreme outlier
    i % 2 ? 'M' : 'F',
    DIAGNOSES[i % 4],
    i < 3 ? `Tiny Village ${i}` : i % 2 ? 'Kyiv' : 'Lviv', // 3 rare values
    `2026-0${1 + (i % 9)}-1${i % 10}`,
    `19${50 + (i % 40)}-05-20`,
    i % 3 ? 'yes' : 'no',
    `Long free text note number ${i} describing the visit in a lot of detail for sure`,
    `L${String(i).padStart(6, '0')}`,
  ]);
  return { columns, rows };
}

// Flags emails, like Presidio would.
const detect = async (values: string[]) => values.map((v) => v.includes('@'));

const byKey = (columns: ColumnProfile[], key: string) =>
  columns.find((c) => c.key === key);

describe('parseDate', () => {
  it.each([
    ['2026-03-15', '2026-03-15'],
    ['15.03.2026', '2026-03-15'],
    ['03/15/2026', '2026-03-15'],
    ['15/03/2026', '2026-03-15'],
  ])('%s', (input, iso) => {
    expect(
      new Date(parseDate(input) * 86_400_000).toISOString().slice(0, 10),
    ).toBe(iso);
  });

  it('rejects non-dates', () => {
    expect(parseDate('2026-13-01')).toBeNull();
    expect(parseDate('hello')).toBeNull();
  });
});

describe('profileTable', () => {
  const now = new Date('2026-09-28T00:00:00Z');

  it('classifies columns and keeps only safe statistics', async () => {
    const { profile, summary } = await profileTable(makeTable(), detect, now);
    const kinds = Object.fromEntries(summary.map((s) => [s.key, s.kind]));
    expect(kinds).toEqual({
      patient_name: 'identifier',
      contact: 'identifier',
      age_years: 'number',
      sex: 'category',
      diagnosis: 'category',
      city: 'category',
      visit_date: 'date',
      date_of_birth: 'age',
      smoker: 'boolean',
      notes: 'excluded',
      lab_code: 'identifier',
    });

    // Nothing identifying, rare or free-text is stored in any form.
    const stored = JSON.stringify(profile);
    for (const leaked of [
      'Patient Number',
      '@mail.com',
      'Tiny Village',
      'free text',
      'L000',
    ]) {
      expect(stored).not.toContain(leaked);
    }

    const age = byKey(profile.columns, 'age_years');
    expect(age.kind === 'number' && Math.max(...age.quantiles)).toBeLessThan(
      999,
    );

    const city = byKey(profile.columns, 'city');
    expect(
      city.kind === 'category' && city.values.map((v) => v.value).sort(),
    ).toEqual(['Kyiv', 'Lviv']);
  });

  it('drops category values the detector flags', async () => {
    const table: Table = {
      columns: ['referrer'],
      rows: Array.from({ length: 60 }, (_, i) => [
        i % 2 ? 'dr.who@clinic.org' : 'GP',
      ]),
    };
    // Half the sample are emails → the column is an identifier altogether.
    const { summary } = await profileTable(table, detect, now);
    expect(summary[0]).toMatchObject({ kind: 'identifier' });

    const mostlyClean: Table = {
      columns: ['referrer'],
      rows: Array.from({ length: 60 }, (_, i) => [
        i < 50 ? 'GP' : 'dr.who@clinic.org',
      ]),
    };
    const result = await profileTable(mostlyClean, detect, now);
    const column = result.profile.columns[0];
    expect(
      column.kind === 'category' && column.values.map((v) => v.value),
    ).toEqual(['GP']);
    expect(result.summary[0].lowConfidence.join()).toMatch(
      /looked like identifiers/,
    );
  });

  it('reports low-confidence columns', async () => {
    const table: Table = {
      columns: ['sparse', 'ward'],
      rows: Array.from({ length: 100 }, (_, i) => [
        i < 20 ? String(i) : null,
        i < 60 ? 'A' : `rare-${i % 10}`,
      ]),
    };
    const { summary } = await profileTable(table, detect, now);
    expect(summary[0].lowConfidence.join()).toMatch(/80% of values are empty/);
    expect(summary[0].lowConfidence.join()).toMatch(/only 20 values/);
    expect(summary[1].lowConfidence.join()).toMatch(/merged into "Other"/);
  });
});

describe('fileDataset', () => {
  it('generates records that follow the profile', async () => {
    const { profile } = await profileTable(
      makeTable(),
      detect,
      new Date('2026-09-28'),
    );
    const dataset = fileDataset(profile);
    const params = {
      framework: Framework.EU_GDPR,
      language: 'en' as const,
      seed: 3,
      referenceDate: new Date(),
    };
    const records = Array.from({ length: 500 }, (_, i) =>
      generateRecord(dataset, params, i),
    );

    expect(dataset.columns.map((c) => c.key)).not.toContain('notes');
    expect(records[4].record_id).toBe('SYN-00005');
    expect(records[4].patient_name).toBe('SYN-PATI-00005');
    for (const r of records) {
      expect(dataset.checkRecord(r)).toEqual([]);
      expect(['M', 'F', OTHER]).toContain(r.sex);
      expect(typeof r.smoker).toBe('boolean');
      expect(String(r.date_of_birth)).toMatch(/^\d{2}-\d{2}$|^90\+$/);
    }
    const hypertension = records.filter(
      (r) => r.diagnosis === 'Hypertension',
    ).length;
    expect(hypertension / records.length).toBeGreaterThan(0.18);
    expect(hypertension / records.length).toBeLessThan(0.32);
  });
});

import { Framework } from '../../deidentify/catalog/frameworks';
import { generateRecord } from '../datasets';
import { buildTemplate, documentDataset, shapeOf } from './template';

const TEXT =
  'Patient: Sarah Johnson, SSN 429-18-7734. Reviewed by Dr. Chen. ' +
  'Sarah Johnson agreed to follow up. Seen at Springfield Clinic.';
const at = (value: string, from = 0) => {
  const start = TEXT.indexOf(value, from);
  return { start, end: start + value.length };
};
const ENTITIES = [
  { type: 'PERSON', ...at('Sarah Johnson'), score: 0.85, included: true },
  { type: 'US_SSN', ...at('429-18-7734'), score: 0.85, included: true },
  { type: 'PERSON', ...at('Chen'), score: 0.55, included: true },
  { type: 'PERSON', ...at('Sarah Johnson', 30), score: 0.85, included: true },
  {
    type: 'ORGANIZATION',
    ...at('Springfield Clinic'),
    score: 0.5,
    included: false,
  },
];
const params = (seed = 1) => ({
  framework: Framework.HIPAA,
  language: 'en' as const,
  seed,
  referenceDate: new Date(),
});

describe('shapeOf', () => {
  it('keeps only the character classes', () => {
    expect(shapeOf('Sarah Johnson')).toBe('Aaaaa Aaaaaaa');
    expect(shapeOf('429-18-7734')).toBe('999-99-9999');
    expect(shapeOf('Олена')).toBe('Aaaaa');
  });
});

describe('buildTemplate', () => {
  const template = buildTemplate(TEXT, ENTITIES, 'en', 0.7);

  it('stores no identifier values', () => {
    const stored = JSON.stringify(template);
    expect(stored).not.toContain('Sarah');
    expect(stored).not.toContain('429-18');
    expect(stored).not.toContain('Chen');
    // Excluded by the reviewer, so it stays as text.
    expect(stored).toContain('Springfield Clinic');
  });

  it('groups repeated values and flags low-confidence slots', () => {
    const slots = template.segments.filter((s) => typeof s !== 'string');
    expect(slots.map((s) => typeof s !== 'string' && s.group)).toEqual([
      1, 2, 3, 1,
    ]);
    expect(slots.map((s) => typeof s !== 'string' && s.lowConfidence)).toEqual([
      false,
      false,
      true,
      false,
    ]);
  });
});

describe('documentDataset', () => {
  const dataset = documentDataset(buildTemplate(TEXT, ENTITIES, 'en', 0.7));

  it('fills every slot with a consistent fake value', () => {
    const record = generateRecord(dataset, params(), 0);
    const text = String(record.document_text);
    expect(text).not.toContain('Sarah Johnson');
    expect(text).not.toContain('429-18-7734');
    expect(text).toMatch(/SSN \d{3}-\d{2}-\d{4}\./);
    expect(text).toContain('Springfield Clinic');

    const name = /^Patient: (.+?), SSN/.exec(text)[1];
    expect(text).toContain(`${name} agreed to follow up`);
    expect(record.identifiers_replaced).toBe(4);
    expect(dataset.checkRecord(record)).toEqual([]);
  });

  it('varies between records and seeds, but is deterministic', () => {
    const a = generateRecord(dataset, params(), 0).document_text;
    expect(generateRecord(dataset, params(), 0).document_text).toBe(a);
    expect(generateRecord(dataset, params(), 1).document_text).not.toBe(a);
    expect(generateRecord(dataset, params(2), 0).document_text).not.toBe(a);
  });

  it('exposes the source-derived text for scanning', () => {
    expect(dataset.staticText).toContain('Reviewed by Dr.');
    expect(dataset.staticText).not.toContain('Sarah');
  });
});

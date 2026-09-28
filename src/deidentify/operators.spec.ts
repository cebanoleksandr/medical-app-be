import {
  buildReplacements,
  OutputMode,
  ReplacementContext,
  ReplacementTarget,
} from './operators';

const targets: ReplacementTarget[] = [
  { type: 'PERSON', value: 'Sarah Johnson' },
  { type: 'US_SSN', value: '429-18-7734' },
  { type: 'PERSON', value: 'Michael Chen' },
  { type: 'PERSON', value: 'sarah  JOHNSON' },
  { type: 'DATE_TIME', value: 'March 15, 2026' },
];

const ctx = (mode: OutputMode, extra: Partial<ReplacementContext> = {}) => ({
  mode,
  language: 'en' as const,
  analysisId: 'a1',
  pseudonymSecret: 'secret',
  ...extra,
});

describe('buildReplacements', () => {
  it('redacts', () => {
    expect(buildReplacements(targets, ctx(OutputMode.REDACT))).toEqual(
      Array(5).fill('[REDACTED]'),
    );
  });

  it('masks letters and digits but keeps the shape', () => {
    const [name, ssn] = buildReplacements(targets, ctx(OutputMode.MASK));
    expect(name).toBe('***** *******');
    expect(ssn).toBe('***-**-****');
  });

  it('numbers placeholders per label and reuses them for the same value', () => {
    expect(buildReplacements(targets, ctx(OutputMode.PLACEHOLDER))).toEqual([
      '[PATIENT_1]',
      '[US_SSN_1]',
      '[PATIENT_2]',
      '[PATIENT_1]',
      '[DATE_1]',
    ]);
  });

  describe('pseudonymize', () => {
    const run = (extra: Partial<ReplacementContext> = {}) =>
      buildReplacements(targets, ctx(OutputMode.PSEUDONYMIZE, extra));

    it('is stable for the same value within an analysis', () => {
      const first = run();
      expect(run()).toEqual(first);
      expect(first[3]).toBe(first[0]);
      expect(first[2]).not.toBe(first[0]);
    });

    it('differs between analyses and secrets', () => {
      const base = run();
      expect(run({ analysisId: 'a2' })[0]).not.toBe(base[0]);
      expect(run({ pseudonymSecret: 'other' })[0]).not.toBe(base[0]);
    });

    it('keeps the format of identifiers and never echoes the value', () => {
      const [name, ssn, , , date] = run();
      expect(name).not.toContain('Sarah');
      expect(ssn).toMatch(/^\d{3}-\d{2}-\d{4}$/);
      expect(ssn).not.toBe('429-18-7734');
      expect(date).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });

    it('uses Ukrainian formats for Ukrainian text', () => {
      const [, , , , date] = run({ language: 'uk' });
      expect(date).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    });
  });
});

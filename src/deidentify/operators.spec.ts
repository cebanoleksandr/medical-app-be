import { EntityMethod } from './catalog/entities';
import {
  buildEntityReplacements,
  buildReplacements,
  EntityTarget,
  generalise,
  maskPartially,
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

describe('buildEntityReplacements', () => {
  const entityCtx = {
    language: 'en' as const,
    analysisId: 'a1',
    pseudonymSecret: 'secret',
  };
  const run = (
    targets: EntityTarget[],
    extra: Partial<typeof entityCtx> = {},
  ) => buildEntityReplacements(targets, { ...entityCtx, ...extra });

  it('applies each target its own method', () => {
    expect(
      run([
        { type: 'US_SSN', value: '429-18-7734', method: EntityMethod.REDACT },
        {
          type: 'PERSON',
          value: 'Sarah Johnson',
          method: EntityMethod.PLACEHOLDER,
        },
        {
          type: 'IP_ADDRESS',
          value: '192.168.1.45',
          method: EntityMethod.GENERALISE,
        },
        {
          type: 'PERSON',
          value: 'Michael Chen',
          method: EntityMethod.PLACEHOLDER,
        },
      ]),
    ).toEqual(['[REDACTED]', '[PATIENT_1]', '192.168.1.0/24', '[PATIENT_2]']);
  });

  it('gives stable tokens per analysis that never echo the value', () => {
    const person = {
      type: 'PERSON',
      value: 'Sarah Johnson',
      method: EntityMethod.TOKEN,
    };
    const [token, again] = run([
      person,
      { ...person, value: 'sarah  JOHNSON' },
    ]);
    expect(token).toMatch(/^PATIENT_[0-9A-F]{6}$/);
    expect(again).toBe(token);
    expect(run([person], { analysisId: 'a2' })[0]).not.toBe(token);
  });

  it('pseudonymises medical record numbers without the value', () => {
    const [mrn] = run([
      {
        type: 'MEDICAL_RECORD_NUMBER',
        value: 'MRN78945612',
        method: EntityMethod.PSEUDONYMISE,
      },
    ]);
    expect(mrn).toMatch(/^PSN-[0-9A-F]{10}$/);
  });

  it('hashes the same value the same way across analyses', () => {
    const device = {
      type: 'MAC_ADDRESS',
      value: '00:1B:44:11:3A:B7',
      method: EntityMethod.HASH,
    };
    const [hash] = run([device]);
    expect(hash).toMatch(/^#[0-9a-f]{16}$/);
    expect(run([device], { analysisId: 'a2' })[0]).toBe(hash);
    expect(run([device], { pseudonymSecret: 'other' })[0]).not.toBe(hash);
  });

  it('replaces with fake values for SYNTHETIC', () => {
    const [name] = run([
      {
        type: 'PERSON',
        value: 'Sarah Johnson',
        method: EntityMethod.SYNTHETIC,
      },
    ]);
    expect(name).not.toContain('Sarah');
    expect(name.length).toBeGreaterThan(3);
  });
});

describe('maskPartially', () => {
  it('keeps the domain of an email', () => {
    expect(maskPartially('sarah.johnson@email.com')).toBe(
      's****.*******@email.com',
    );
  });

  it('keeps the last 4 characters of numbers', () => {
    expect(maskPartially('4111 1111 1111 1234')).toBe('**** **** **** 1234');
    expect(maskPartially('+1 (555) 201-8834')).toBe('+* (***) ***-8834');
  });

  it('keeps the initial of each word', () => {
    expect(maskPartially('Springfield Medical Center')).toBe(
      'S********** M****** C*****',
    );
  });
});

describe('generalise', () => {
  const g = (type: string, value: string, language: 'en' | 'uk' = 'en') =>
    generalise({ type, value }, language);

  it('rounds dates to a quarter, or keeps only the year', () => {
    expect(g('DATE_TIME', 'March 15, 2026')).toBe('Q1 2026');
    expect(g('DATE_TIME', '10/03/2026')).toBe('Q4 2026');
    expect(g('DATE_TIME', '10.03.2026', 'uk')).toBe('Q1 2026');
    expect(g('DATE_TIME', 'in 1978')).toBe('1978');
    expect(g('DATE_TIME', 'yesterday')).toBe('[DATE]');
  });

  it('keeps the network of IP addresses', () => {
    expect(g('IP_ADDRESS', '192.168.1.45')).toBe('192.168.1.0/24');
    expect(g('IP_ADDRESS', '2001:db8:85a3:0:0:8a2e:370:7334')).toBe(
      '2001:db8:85a3::/48',
    );
  });

  it('drops streets and shortens postcodes', () => {
    expect(g('LOCATION', '1500 Lake Shore Dr, Chicago, IL 60601')).toBe(
      'Chicago, IL 606XX',
    );
    expect(g('LOCATION', 'Chicago')).toBe('Chicago');
    expect(g('LOCATION', '1500 Lake Shore Dr')).toBe('[LOCATION]');
  });

  it('falls back to a type label', () => {
    expect(g('PERSON', 'Sarah Johnson')).toBe('[PATIENT]');
  });
});

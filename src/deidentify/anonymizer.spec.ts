import {
  applyReplacements,
  hasOverlaps,
  resolveOverlaps,
  Span,
} from './anonymizer';

const span = (type: string, start: number, end: number, score: number) =>
  ({ type, start, end, score }) as Span;

describe('resolveOverlaps', () => {
  it('keeps the highest-scoring entity of an overlapping group', () => {
    const email = span('EMAIL_ADDRESS', 10, 33, 1);
    const result = resolveOverlaps([
      span('URL', 10, 18, 0.5),
      email,
      span('URL', 24, 33, 0.5),
    ]);
    expect(result).toEqual([email]);
  });

  it('prefers the longer span on equal score', () => {
    const long = span('LOCATION', 0, 24, 0.85);
    expect(resolveOverlaps([span('LOCATION', 13, 24, 0.85), long])).toEqual([
      long,
    ]);
  });

  it('prefers a specific type over a catch-all on the same span', () => {
    const rnokpp = span('UA_RNOKPP', 5, 15, 0.4);
    expect(resolveOverlaps([span('GENERIC_ID', 5, 15, 0.4), rnokpp])).toEqual([
      rnokpp,
    ]);
  });

  it('keeps adjacent entities and returns them in text order', () => {
    const a = span('PERSON', 0, 5, 0.85);
    const b = span('DATE_TIME', 5, 10, 0.6);
    expect(resolveOverlaps([b, a])).toEqual([a, b]);
  });
});

describe('hasOverlaps', () => {
  it('detects overlapping spans regardless of order', () => {
    expect(
      hasOverlaps([
        { start: 5, end: 10 },
        { start: 0, end: 6 },
      ]),
    ).toBe(true);
    expect(
      hasOverlaps([
        { start: 5, end: 10 },
        { start: 0, end: 5 },
      ]),
    ).toBe(false);
  });
});

describe('applyReplacements', () => {
  it('replaces every span and keeps the text around them', () => {
    const text = 'Patient: Sarah Johnson, SSN 429-18-7734.';
    expect(
      applyReplacements(text, [
        { start: 28, end: 39, replacement: '[SSN]' },
        { start: 9, end: 22, replacement: '[PATIENT_1]' },
      ]),
    ).toBe('Patient: [PATIENT_1], SSN [SSN].');
  });

  it('returns the text unchanged when nothing was detected', () => {
    expect(applyReplacements('nothing here', [])).toBe('nothing here');
  });
});

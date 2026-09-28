export interface Span {
  type: string;
  start: number;
  end: number;
  score: number;
}

// Catch-all recognizers lose ties to specific ones on the same span.
const WEAK_TYPES = new Set(['GENERIC_ID', 'URL']);

/**
 * Keeps one entity per region of text: higher score wins, then the longer span,
 * then the more specific type. E.g. an EMAIL_ADDRESS (1.0) swallows the URL
 * fragments (0.5) Presidio also reports inside it.
 */
export function resolveOverlaps<T extends Span>(spans: T[]): T[] {
  const ranked = [...spans].sort(
    (a, b) =>
      b.score - a.score ||
      b.end - b.start - (a.end - a.start) ||
      Number(WEAK_TYPES.has(a.type)) - Number(WEAK_TYPES.has(b.type)),
  );

  const kept: T[] = [];
  for (const span of ranked) {
    if (kept.every((k) => span.end <= k.start || span.start >= k.end)) {
      kept.push(span);
    }
  }
  return kept.sort((a, b) => a.start - b.start);
}

export function hasOverlaps(spans: { start: number; end: number }[]): boolean {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  return sorted.some((span, i) => i > 0 && span.start < sorted[i - 1].end);
}

/** `edits` must be non-overlapping (see resolveOverlaps). */
export function applyReplacements(
  text: string,
  edits: { start: number; end: number; replacement: string }[],
): string {
  let out = '';
  let cursor = 0;
  for (const edit of [...edits].sort((a, b) => a.start - b.start)) {
    out += text.slice(cursor, edit.start) + edit.replacement;
    cursor = edit.end;
  }
  return out + text.slice(cursor);
}

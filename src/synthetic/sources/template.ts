import { fakeValue, seededFaker } from '../../deidentify/operators';
import { col, DatasetDefinition, SourceDatasetType } from '../datasets/types';
import { Language } from '../reference/localized';

/** A slot where the source had an identifier: only its type and shape remain. */
export interface TemplateSlot {
  type: string;
  /** Slots with the same group had the same value in the source document. */
  group: number;
  /** `Sarah Johnson` → `Aaaaa Aaaaaaa`, `429-18-7734` → `999-99-9999`. */
  shape: string;
  lowConfidence: boolean;
}

export interface DocumentTemplate {
  language: Language;
  segments: (string | TemplateSlot)[];
}

export function shapeOf(value: string): string {
  return value
    .replace(/\p{Lu}/gu, 'A')
    .replace(/\p{Ll}/gu, 'a')
    .replace(/\p{N}/gu, '9');
}

/**
 * Cuts identifiers out of a document. Excluded entities stay as text: the
 * user reviewed them and decided they are not identifiers.
 */
export function buildTemplate(
  text: string,
  entities: {
    type: string;
    start: number;
    end: number;
    score: number;
    included: boolean;
  }[],
  language: Language,
  lowConfidenceBelow: number,
): DocumentTemplate {
  const groups = new Map<string, number>();
  const segments: DocumentTemplate['segments'] = [];
  let cursor = 0;

  for (const e of [...entities]
    .filter((x) => x.included)
    .sort((a, b) => a.start - b.start)) {
    if (e.start > cursor) segments.push(text.slice(cursor, e.start));
    const value = text.slice(e.start, e.end);
    const key = `${e.type}|${value.toLowerCase().replace(/\s+/g, ' ').trim()}`;
    if (!groups.has(key)) groups.set(key, groups.size + 1);
    segments.push({
      type: e.type,
      group: groups.get(key),
      shape: shapeOf(value),
      lowConfidence: e.score < lowConfidenceBelow,
    });
    cursor = e.end;
  }
  if (cursor < text.length) segments.push(text.slice(cursor));
  return { language, segments };
}

/** Every record is the source document with fresh fake values in each slot. */
export function documentDataset(template: DocumentTemplate): DatasetDefinition {
  const slots = template.segments.filter(
    (s): s is TemplateSlot => typeof s !== 'string',
  );
  const staticText = template.segments
    .filter((s): s is string => typeof s === 'string')
    .join('\n');

  return {
    id: SourceDatasetType.FROM_DOCUMENT,
    name: 'From de-identified document',
    description:
      'Variants of a de-identified document with synthetic identifiers',
    recordsPerPatient: 1,
    previewColumns: ['record_id', 'document_text', 'identifiers_replaced'],
    columns: [
      col('record_id', 'Record ID', 'string', 'id'),
      col('document_text', 'Document', 'text'),
      col('identifiers_replaced', 'Identifiers replaced', 'number'),
    ],
    staticText,
    generate(ctx) {
      // One fake value per group keeps a person's name the same throughout.
      const values = new Map<number, string>();
      const text = template.segments
        .map((segment) => {
          if (typeof segment === 'string') return segment;
          if (!values.has(segment.group)) {
            const faker = seededFaker(template.language, [
              ctx.params.seed,
              ctx.index,
              segment.group,
            ]);
            values.set(
              segment.group,
              fakeValue(segment.type, segment.shape, template.language, faker),
            );
          }
          return values.get(segment.group);
        })
        .join('');
      return {
        record_id: ctx.id,
        document_text: text,
        identifiers_replaced: slots.length,
      };
    },
    checkRecord(record) {
      return String(record.document_text ?? '').trim()
        ? []
        : ['document_text is empty'];
    },
  };
}

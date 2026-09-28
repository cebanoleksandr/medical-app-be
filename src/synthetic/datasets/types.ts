import { CellValue, RecordContext, SyntheticRecord } from '../generator';

export enum DatasetType {
  PATIENT_RECORDS = 'PATIENT_RECORDS',
  CLINICAL_NOTES = 'CLINICAL_NOTES',
  LAB_RESULTS = 'LAB_RESULTS',
  PRESCRIPTIONS = 'PRESCRIPTIONS',
}

/** Datasets whose shape comes from a user-provided source. */
export enum SourceDatasetType {
  FROM_FILE = 'FROM_FILE',
  FROM_DOCUMENT = 'FROM_DOCUMENT',
}

export type AnyDatasetType = DatasetType | SourceDatasetType;

export interface ColumnDefinition {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'text';
  /**
   * `id`: synthetic identifier (SYN-…); `code`: value from a fixed
   * vocabulary (ICD-10, LOINC, the region list). Both are skipped by the
   * direct-identifier scan.
   */
  role?: 'id' | 'code';
}

export interface DatasetDefinition {
  id: AnyDatasetType;
  name: string;
  description: string;
  /** How many consecutive records belong to one synthetic patient. */
  recordsPerPatient: number;
  /** Columns shown in the preview table unless the user picks others. */
  previewColumns: string[];
  columns: ColumnDefinition[];
  /**
   * Text shared by every record that came from a user's source (a document
   * template); validation scans it for identifiers the source still contains.
   */
  staticText?: string;
  /** Must set exactly the keys in `columns`. */
  generate(ctx: RecordContext): SyntheticRecord;
  /**
   * Cross-field plausibility checks; returns one message per problem. Drives
   * the per-record Good/Fair quality and the dataset's consistency score.
   */
  checkRecord(record: SyntheticRecord): string[];
  /**
   * For sourced datasets: the distribution a column should follow (among
   * non-empty values), bucketed; used to score fidelity to the source.
   */
  distribution?(key: string): {
    expected: Map<string, number>;
    bucket(value: CellValue): string;
  } | null;
}

export const col = (
  key: string,
  label: string,
  type: ColumnDefinition['type'] = 'string',
  role?: ColumnDefinition['role'],
): ColumnDefinition =>
  role ? { key, label, type, role } : { key, label, type };

export const inRange = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && value >= min && value <= max;

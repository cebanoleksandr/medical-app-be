import { GenerationParams, RecordContext, SyntheticRecord } from '../generator';
import { CLINICAL_NOTES } from './clinical-notes';
import { LAB_RESULTS } from './lab-results';
import { PATIENT_RECORDS } from './patient-records';
import { PRESCRIPTIONS } from './prescriptions';
import { DatasetDefinition, DatasetType } from './types';

export { DatasetType, SourceDatasetType } from './types';
export type { AnyDatasetType, DatasetDefinition } from './types';

export const DATASETS: Record<DatasetType, DatasetDefinition> = {
  [DatasetType.PATIENT_RECORDS]: PATIENT_RECORDS,
  [DatasetType.CLINICAL_NOTES]: CLINICAL_NOTES,
  [DatasetType.LAB_RESULTS]: LAB_RESULTS,
  [DatasetType.PRESCRIPTIONS]: PRESCRIPTIONS,
};

/** Record `index` of a dataset; the same inputs always give the same record. */
export function generateRecord(
  dataset: DatasetDefinition,
  params: GenerationParams,
  index: number,
): SyntheticRecord {
  const record = dataset.generate(
    new RecordContext(params, index, dataset.recordsPerPatient),
  );
  // Fixed column order regardless of how generate() built the object.
  return Object.fromEntries(
    dataset.columns.map((c) => [c.key, record[c.key] ?? null]),
  );
}

/** Yields records in batches so large exports don't block the event loop. */
export async function* generateRecords(
  dataset: DatasetDefinition,
  params: GenerationParams,
  count: number,
  batchSize = 500,
): AsyncGenerator<SyntheticRecord> {
  for (let start = 0; start < count; start += batchSize) {
    const end = Math.min(start + batchSize, count);
    for (let i = start; i < end; i++) yield generateRecord(dataset, params, i);
    await new Promise((resolve) => setImmediate(resolve));
  }
}

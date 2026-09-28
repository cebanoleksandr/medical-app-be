import { RecordContext } from '../generator';
import { l } from '../reference/localized';
import {
  DEPARTMENTS,
  LAB_TESTS,
  LabKey,
  ROUTINE_LABS,
} from '../reference/medical';
import { col, DatasetDefinition, DatasetType } from './types';

const STATUSES = [l('Final', 'Остаточний'), l('Preliminary', 'Попередній')];

/** Probability that a lab the diagnosis affects actually comes back abnormal. */
const ABNORMAL_RATE = 0.8;

export function labValue(
  ctx: RecordContext,
  key: LabKey,
  direction: 'high' | 'low' | undefined,
): number {
  const test = LAB_TESTS[key];
  const { low, high } =
    ctx.patient.sex === 'F' && 'female' in test ? test.female : test;
  const span = high - low;

  if (direction === 'high' && ctx.chance(ABNORMAL_RATE)) {
    return ctx.float(high + span * 0.15, high + span * 2, test.decimals);
  }
  if (direction === 'low' && ctx.chance(ABNORMAL_RATE)) {
    return ctx.float(low * 0.45, low * 0.92, test.decimals);
  }
  // Mostly inside the range, with the occasional borderline value.
  return ctx.float(low + span * 0.05, high + span * 0.04, test.decimals);
}

export const LAB_RESULTS: DatasetDefinition = {
  id: DatasetType.LAB_RESULTS,
  name: 'Lab Results',
  description: 'Laboratory tests with LOINC codes, units and reference ranges',
  recordsPerPatient: 4,
  previewColumns: [
    'record_id',
    'test_name',
    'age_range',
    'collected_date',
    'flag',
  ],
  columns: [
    col('record_id', 'Record ID', 'string', 'id'),
    col('patient_ref', 'Patient reference', 'string', 'id'),
    col('sex', 'Sex'),
    col('age_range', 'Age range'),
    col('collected_date', 'Collected date', 'date'),
    col('test_code', 'Test code (LOINC)', 'string', 'code'),
    col('test_name', 'Test'),
    col('value', 'Value', 'number'),
    col('unit', 'Unit'),
    col('reference_low', 'Reference low', 'number'),
    col('reference_high', 'Reference high', 'number'),
    col('flag', 'Flag (L/N/H)'),
    col('specimen', 'Specimen'),
    col('ordering_department', 'Ordering department'),
    col('diagnosis_code', 'Related diagnosis (ICD-10)', 'string', 'code'),
    col('status', 'Status'),
  ],
  checkRecord(r) {
    const issues: string[] = [];
    const value = Number(r.value);
    const low = Number(r.reference_low);
    const high = Number(r.reference_high);
    if (!(low < high)) issues.push('reference range is inverted');
    if (value < 0) issues.push('value is negative');
    const flag = value < low ? 'L' : value > high ? 'H' : 'N';
    if (r.flag !== flag) issues.push('flag does not match the reference range');
    return issues;
  },
  generate(ctx) {
    const p = ctx.patient;
    const related = Object.keys(p.diagnosis.labs) as LabKey[];
    const key: LabKey =
      related.length && ctx.chance(0.6)
        ? ctx.pick(related)
        : ctx.pick(ROUTINE_LABS);
    const test = LAB_TESTS[key];
    const range = p.sex === 'F' && 'female' in test ? test.female : test;
    const value = labValue(ctx, key, p.diagnosis.labs[key]);

    return {
      record_id: ctx.id,
      patient_ref: p.ref,
      sex: p.sex,
      age_range: p.ageBand,
      collected_date: ctx.date(),
      test_code: test.loinc,
      test_name: ctx.t(test.name),
      value,
      unit: test.unit,
      reference_low: range.low,
      reference_high: range.high,
      flag: value < range.low ? 'L' : value > range.high ? 'H' : 'N',
      specimen: ctx.t(test.specimen),
      ordering_department: ctx.t(DEPARTMENTS[p.diagnosis.department]),
      diagnosis_code: p.diagnosis.icd10,
      status: ctx.t(ctx.chance(0.93) ? STATUSES[0] : STATUSES[1]),
    };
  },
};

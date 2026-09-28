import { l } from '../reference/localized';
import { FREQUENCIES, MEDICATIONS } from '../reference/medical';
import { col, DatasetDefinition, DatasetType } from './types';

const PRESCRIBERS = [
  l('Attending physician', 'Лікар-куратор'),
  l('Resident', 'Лікар-інтерн'),
  l('Family physician', 'Сімейний лікар'),
  l('Nurse practitioner', 'Медсестра-практик'),
];

const DOSES_PER_DAY = new Map([
  [FREQUENCIES.once, 1],
  [FREQUENCIES.twice, 2],
  [FREQUENCIES.thrice, 3],
  [FREQUENCIES.prn, 1],
]);

export const PRESCRIPTIONS: DatasetDefinition = {
  id: DatasetType.PRESCRIPTIONS,
  name: 'Prescriptions',
  description: 'Medication orders with ATC codes, dosing and indications',
  recordsPerPatient: 3,
  previewColumns: [
    'record_id',
    'medication',
    'age_range',
    'prescribed_date',
    'frequency',
  ],
  columns: [
    col('record_id', 'Record ID', 'string', 'id'),
    col('patient_ref', 'Patient reference', 'string', 'id'),
    col('sex', 'Sex'),
    col('age_range', 'Age range'),
    col('prescribed_date', 'Prescribed date', 'date'),
    col('medication', 'Medication'),
    col('atc_code', 'ATC code', 'string', 'code'),
    col('strength', 'Strength'),
    col('dose_form', 'Dose form'),
    col('route', 'Route'),
    col('frequency', 'Frequency'),
    col('duration_days', 'Duration (days)', 'number'),
    col('quantity', 'Quantity', 'number'),
    col('refills', 'Refills', 'number'),
    col('indication_code', 'Indication (ICD-10)', 'string', 'code'),
    col('indication', 'Indication'),
    col('prescriber_role', 'Prescriber role'),
  ],
  checkRecord(r) {
    const issues: string[] = [];
    if (!(Number(r.duration_days) > 0))
      issues.push('duration_days must be positive');
    if (!(Number(r.quantity) > 0)) issues.push('quantity must be positive');
    if (Number(r.refills) < 0) issues.push('refills is negative');
    return issues;
  },
  generate(ctx) {
    const p = ctx.patient;
    // Mostly the primary condition; sometimes the secondary one.
    const dx = p.secondary && ctx.chance(0.3) ? p.secondary : p.diagnosis;
    const med = MEDICATIONS[ctx.pick(dx.medications)];
    const longTerm = med.courseDays === null;
    const duration = med.courseDays ?? ctx.pick([30, 60, 90]);
    const dosesPerDay = DOSES_PER_DAY.get(med.frequency) ?? 1;

    return {
      record_id: ctx.id,
      patient_ref: p.ref,
      sex: p.sex,
      age_range: p.ageBand,
      prescribed_date: ctx.date(),
      medication: ctx.t(med.name),
      atc_code: med.atc,
      strength: ctx.strength(ctx.pick(med.strengths)),
      dose_form: ctx.t(med.form),
      route: ctx.t(med.route),
      frequency: ctx.t(med.frequency),
      duration_days: duration,
      // Tablets/capsules are counted; inhalers and vials are one pack.
      quantity:
        med.route.en === 'Oral' ? Math.min(duration * dosesPerDay, 90) : 1,
      refills: longTerm ? ctx.int(1, 5) : 0,
      indication_code: dx.icd10,
      indication: ctx.t(dx.name),
      prescriber_role: ctx.t(ctx.pick(PRESCRIBERS)),
    };
  },
};

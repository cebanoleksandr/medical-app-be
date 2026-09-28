import { l } from '../reference/localized';
import { DEPARTMENTS } from '../reference/medical';
import { col, DatasetDefinition, DatasetType, inRange } from './types';

const ADMISSION_TYPES = [
  l('Emergency', 'Екстрена'),
  l('Elective', 'Планова'),
  l('Urgent', 'Невідкладна'),
];
const SMOKING = [
  l('Never', 'Некурець'),
  l('Former', 'Колишній курець'),
  l('Current', 'Курець'),
];
const INSURANCE = [
  l('Public', 'Державне'),
  l('Private', 'Приватне'),
  l('Self-pay', 'Власні кошти'),
];
const DISPOSITIONS = [
  l('Home', 'Додому'),
  l('Home with care', 'Додому під нагляд'),
  l('Rehabilitation', 'Реабілітація'),
  l('Transfer', 'Переведення'),
];

export const PATIENT_RECORDS: DatasetDefinition = {
  id: DatasetType.PATIENT_RECORDS,
  name: 'Patient Records',
  description: 'Hospital encounters with demographics, diagnoses and vitals',
  recordsPerPatient: 1,
  previewColumns: [
    'record_id',
    'department',
    'age_range',
    'admission_date',
    'primary_diagnosis',
  ],
  columns: [
    col('record_id', 'Record ID', 'string', 'id'),
    col('sex', 'Sex'),
    col('age_range', 'Age range'),
    col('region', 'Region', 'string', 'code'),
    col('admission_date', 'Admission date', 'date'),
    col('discharge_date', 'Discharge date', 'date'),
    col('length_of_stay_days', 'Length of stay (days)', 'number'),
    col('admission_type', 'Admission type'),
    col('department', 'Department'),
    col(
      'primary_diagnosis_code',
      'Primary diagnosis (ICD-10)',
      'string',
      'code',
    ),
    col('primary_diagnosis', 'Primary diagnosis'),
    col(
      'secondary_diagnosis_code',
      'Secondary diagnosis (ICD-10)',
      'string',
      'code',
    ),
    col('secondary_diagnosis', 'Secondary diagnosis'),
    col('smoking_status', 'Smoking status'),
    col('bmi', 'BMI', 'number'),
    col('systolic_bp', 'Systolic BP (mmHg)', 'number'),
    col('diastolic_bp', 'Diastolic BP (mmHg)', 'number'),
    col('heart_rate', 'Heart rate (bpm)', 'number'),
    col('temperature_c', 'Temperature (°C)', 'number'),
    col('insurance_type', 'Insurance'),
    col('discharge_disposition', 'Discharge disposition'),
    col('readmitted_30d', 'Readmitted within 30 days', 'boolean'),
  ],
  checkRecord(r) {
    const issues: string[] = [];
    if (String(r.discharge_date) < String(r.admission_date)) {
      issues.push('discharge_date is before admission_date');
    }
    const stay =
      (Date.parse(String(r.discharge_date)) -
        Date.parse(String(r.admission_date))) /
      86_400_000;
    if (stay !== r.length_of_stay_days) {
      issues.push('length_of_stay_days does not match the dates');
    }
    if (Number(r.diastolic_bp) >= Number(r.systolic_bp)) {
      issues.push('diastolic_bp is not below systolic_bp');
    }
    if (!inRange(r.bmi, 12, 70)) issues.push('bmi is implausible');
    if (!inRange(r.heart_rate, 30, 220))
      issues.push('heart_rate is implausible');
    if (!inRange(r.temperature_c, 34, 42)) {
      issues.push('temperature_c is implausible');
    }
    if (r.secondary_diagnosis_code === r.primary_diagnosis_code) {
      issues.push('secondary diagnosis repeats the primary one');
    }
    return issues;
  },
  generate(ctx) {
    const p = ctx.patient;
    const dx = p.diagnosis;
    const stay = dx.surgical ? ctx.int(2, 9) : ctx.int(0, 6);
    // Admitted early enough that the discharge isn't in the future.
    const admission = ctx.date(365, stay);
    const discharge = new Date(`${admission}T00:00:00Z`);
    discharge.setUTCDate(discharge.getUTCDate() + stay);

    const hypertensive = dx.icd10 === 'I10' || p.secondary?.icd10 === 'I10';
    const febrile = ['J18.9', 'K35.8', 'N39.0'].includes(dx.icd10);
    const systolic = hypertensive ? ctx.int(140, 185) : ctx.int(105, 138);

    return {
      record_id: ctx.id,
      sex: p.sex,
      age_range: p.ageBand,
      region: p.region,
      admission_date: admission,
      discharge_date: discharge.toISOString().slice(0, 10),
      length_of_stay_days: stay,
      admission_type: ctx.t(
        dx.surgical || febrile ? ADMISSION_TYPES[0] : ctx.pick(ADMISSION_TYPES),
      ),
      department: ctx.t(DEPARTMENTS[dx.department]),
      primary_diagnosis_code: dx.icd10,
      primary_diagnosis: ctx.t(dx.name),
      secondary_diagnosis_code: p.secondary?.icd10 ?? null,
      secondary_diagnosis: p.secondary ? ctx.t(p.secondary.name) : null,
      smoking_status: ctx.t(ctx.pick(SMOKING)),
      bmi: ctx.float(18.5, 38, 1),
      systolic_bp: systolic,
      diastolic_bp: Math.round(systolic * ctx.float(0.58, 0.68, 2)),
      heart_rate: dx.icd10 === 'I48.9' ? ctx.int(95, 140) : ctx.int(58, 98),
      temperature_c: febrile
        ? ctx.float(37.8, 39.4, 1)
        : ctx.float(36.2, 37.2, 1),
      insurance_type: ctx.t(ctx.pick(INSURANCE)),
      discharge_disposition: ctx.t(
        p.age >= 75 && dx.surgical ? DISPOSITIONS[2] : ctx.pick(DISPOSITIONS),
      ),
      readmitted_30d: ctx.chance(p.age >= 75 ? 0.18 : 0.08),
    };
  },
};

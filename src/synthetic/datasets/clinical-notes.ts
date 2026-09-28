import { RecordContext } from '../generator';
import { l, Localized } from '../reference/localized';
import {
  DEPARTMENTS,
  LAB_TESTS,
  LabKey,
  MEDICATIONS,
} from '../reference/medical';
import { labValue } from './lab-results';
import { col, DatasetDefinition, DatasetType } from './types';

const DOC_TYPES = {
  discharge: l('Discharge Summary', 'Виписний епікриз'),
  progress: l('Progress Note', 'Щоденник спостереження'),
  consultation: l('Consultation', 'Консультація'),
  operative: l('Operative Report', 'Протокол операції'),
  radiology: l('Radiology Report', 'Протокол променевого дослідження'),
};
type DocType = keyof typeof DOC_TYPES;

const AUTHORS = [
  l('Attending physician', 'Лікар-куратор'),
  l('Resident', 'Лікар-інтерн'),
  l('Consultant', 'Консультант'),
];

/** Pieces every template draws from; all already in the note's language. */
interface NoteParts {
  patient: string;
  diagnosis: string;
  symptoms: string;
  department: string;
  lab: string | null;
  medications: string;
  days: number;
  study: string;
  finding: string;
  female: boolean;
}

/** Ukrainian past participles agree with the patient's sex. */
const g = (p: NoteParts, male: string, female: string) =>
  p.female ? female : male;

function describePatient(ctx: RecordContext): string {
  const { sex, ageBand } = ctx.patient;
  return ctx.t(
    sex === 'M'
      ? l(
          `A male patient aged ${ageBand}`,
          `Пацієнт чоловічої статі віком ${ageBand} років`,
        )
      : l(
          `A female patient aged ${ageBand}`,
          `Пацієнтка віком ${ageBand} років`,
        ),
  );
}

function describeLab(ctx: RecordContext): string | null {
  const affected = Object.entries(ctx.patient.diagnosis.labs) as [
    LabKey,
    'high' | 'low',
  ][];
  if (!affected.length) return null;
  const [key, direction] = ctx.pick(affected);
  const test = LAB_TESTS[key];
  return `${ctx.t(test.name)} ${labValue(ctx, key, direction)} ${test.unit}`;
}

const TEMPLATES: Record<
  DocType,
  Record<'en' | 'uk', (p: NoteParts) => string>
> = {
  discharge: {
    en: (p) =>
      [
        `${p.patient} was admitted to ${p.department} with ${p.symptoms}.`,
        `Diagnosis: ${p.diagnosis}.`,
        p.lab
          ? `Relevant results: ${p.lab}.`
          : 'Laboratory results were within normal limits.',
        `The patient was treated for ${p.days} days and improved clinically.`,
        `Discharge medications: ${p.medications}.`,
        'Follow-up with the primary care physician in 2 weeks.',
      ].join('\n'),
    uk: (p) =>
      [
        `${p.patient} ${g(p, 'госпіталізований', 'госпіталізована')} до відділення «${p.department}» зі скаргами на ${p.symptoms}.`,
        `Діагноз: ${p.diagnosis}.`,
        p.lab
          ? `Значущі результати: ${p.lab}.`
          : 'Лабораторні показники в межах норми.',
        `Проведено лікування протягом ${p.days} днів, стан покращився.`,
        `Рекомендовано при виписці: ${p.medications}.`,
        'Контроль у сімейного лікаря через 2 тижні.',
      ].join('\n'),
  },
  progress: {
    en: (p) =>
      [
        `S: ${p.patient} reports ${p.symptoms}, somewhat improved since the last review.`,
        'O: Vital signs stable. Alert and oriented.',
        p.lab ? `Labs: ${p.lab}.` : 'Labs: no new abnormalities.',
        `A: ${p.diagnosis}.`,
        `P: Continue ${p.medications}. Reassess tomorrow.`,
      ].join('\n'),
    uk: (p) =>
      [
        `С: ${p.patient} скаржиться на ${p.symptoms}, з позитивною динамікою.`,
        'О: Гемодинаміка стабільна. Свідомість ясна.',
        p.lab ? `Аналізи: ${p.lab}.` : 'Аналізи: нових відхилень немає.',
        `О: ${p.diagnosis}.`,
        `П: Продовжити ${p.medications}. Повторний огляд завтра.`,
      ].join('\n'),
  },
  consultation: {
    en: (p) =>
      [
        `Reason for consultation: ${p.symptoms}.`,
        `${p.patient} was reviewed at the request of the ${p.department} team.`,
        p.lab
          ? `Pertinent findings: ${p.lab}.`
          : 'Examination unremarkable apart from the presenting complaint.',
        `Impression: ${p.diagnosis}.`,
        `Recommendations: start ${p.medications}; review response in 4-6 weeks.`,
      ].join('\n'),
    uk: (p) =>
      [
        `Привід для консультації: ${p.symptoms}.`,
        `${p.patient} ${g(p, 'оглянутий', 'оглянута')} на запит відділення «${p.department}».`,
        p.lab
          ? `Значущі дані: ${p.lab}.`
          : 'Під час огляду, окрім основної скарги, без особливостей.',
        `Висновок: ${p.diagnosis}.`,
        `Рекомендації: призначити ${p.medications}; оцінити ефект через 4-6 тижнів.`,
      ].join('\n'),
  },
  operative: {
    en: (p) =>
      [
        `Preoperative diagnosis: ${p.diagnosis}.`,
        `${p.patient} underwent surgery under general anaesthesia without complications.`,
        'Estimated blood loss was minimal. Specimen sent to pathology.',
        `Postoperative plan: ${p.medications}; early mobilisation.`,
      ].join('\n'),
    uk: (p) =>
      [
        `Передопераційний діагноз: ${p.diagnosis}.`,
        `${p.patient} ${g(p, 'прооперований', 'прооперована')} під загальною анестезією без ускладнень.`,
        'Крововтрата мінімальна. Матеріал направлено на гістологічне дослідження.',
        `Післяопераційний план: ${p.medications}; рання активізація.`,
      ].join('\n'),
  },
  radiology: {
    en: (p) =>
      [
        `Examination: ${p.study}.`,
        `Clinical indication: ${p.symptoms}.`,
        `Findings: ${p.finding}.`,
        `Impression: findings consistent with ${p.diagnosis.toLowerCase()}.`,
      ].join('\n'),
    uk: (p) =>
      [
        `Дослідження: ${p.study}.`,
        `Клінічні показання: ${p.symptoms}.`,
        `Опис: ${p.finding}.`,
        `Висновок: ознаки, що відповідають діагнозу «${p.diagnosis}».`,
      ].join('\n'),
  },
};

function pickDocType(ctx: RecordContext): DocType {
  const dx = ctx.patient.diagnosis;
  const options: DocType[] = ['discharge', 'progress', 'consultation'];
  if (dx.surgical) options.push('operative', 'operative');
  if (dx.imaging) options.push('radiology');
  return ctx.pick(options);
}

const joinLocalized = (ctx: RecordContext, items: Localized[]) =>
  items.map((i) => ctx.t(i)).join(ctx.t(l(' and ', ' та ')));

export const CLINICAL_NOTES: DatasetDefinition = {
  id: DatasetType.CLINICAL_NOTES,
  name: 'Clinical Notes',
  description: 'Free-text notes: discharge summaries, progress notes, reports',
  recordsPerPatient: 1,
  previewColumns: [
    'record_id',
    'doc_type',
    'age_range',
    'note_date',
    'department',
  ],
  columns: [
    col('record_id', 'Record ID', 'string', 'id'),
    col('doc_type', 'Document type'),
    col('sex', 'Sex'),
    col('age_range', 'Age range'),
    col('note_date', 'Date', 'date'),
    col('department', 'Department'),
    col('author_role', 'Author role'),
    col('diagnosis_code', 'Diagnosis (ICD-10)', 'string', 'code'),
    col('diagnosis', 'Diagnosis'),
    col('note_text', 'Note', 'text'),
    col('word_count', 'Word count', 'number'),
  ],
  checkRecord(r) {
    const issues: string[] = [];
    const text = String(r.note_text ?? '');
    if (text.trim().length < 40) issues.push('note_text is too short');
    if (text.split(/\s+/).filter(Boolean).length !== r.word_count) {
      issues.push('word_count does not match note_text');
    }
    return issues;
  },
  generate(ctx) {
    const p = ctx.patient;
    const dx = p.diagnosis;
    const docType = pickDocType(ctx);
    const medications = dx.medications
      .slice(0, 2)
      .map((key) => {
        const med = MEDICATIONS[key];
        return `${ctx.t(med.name)} ${ctx.strength(ctx.pick(med.strengths))} ${ctx.t(med.frequency).toLowerCase()}`;
      })
      .join(', ');

    const note = TEMPLATES[docType][ctx.params.language]({
      patient: describePatient(ctx),
      diagnosis: ctx.t(dx.name),
      symptoms: joinLocalized(ctx, dx.symptoms),
      department: ctx.t(DEPARTMENTS[dx.department]),
      lab: describeLab(ctx),
      medications,
      days: ctx.int(2, 9),
      study: dx.imaging ? ctx.t(dx.imaging.study) : '',
      finding: dx.imaging ? ctx.t(dx.imaging.finding) : '',
      female: p.sex === 'F',
    });

    return {
      record_id: ctx.id,
      doc_type: ctx.t(DOC_TYPES[docType]),
      sex: p.sex,
      age_range: p.ageBand,
      note_date: ctx.date(),
      department: ctx.t(DEPARTMENTS[dx.department]),
      author_role: ctx.t(ctx.pick(AUTHORS)),
      diagnosis_code: dx.icd10,
      diagnosis: ctx.t(dx.name),
      note_text: note,
      word_count: note.split(/\s+/).filter(Boolean).length,
    };
  },
};

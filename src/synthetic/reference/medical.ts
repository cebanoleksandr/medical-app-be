import { l, Localized } from './localized';

export type DepartmentKey = keyof typeof DEPARTMENTS;

export const DEPARTMENTS = {
  internal: l('Internal Medicine', 'Терапія'),
  cardiology: l('Cardiology', 'Кардіологія'),
  pulmonology: l('Pulmonology', 'Пульмонологія'),
  endocrinology: l('Endocrinology', 'Ендокринологія'),
  surgery: l('General Surgery', 'Загальна хірургія'),
  orthopedics: l('Orthopedics', 'Ортопедія'),
  nephrology: l('Nephrology', 'Нефрологія'),
  neurology: l('Neurology', 'Неврологія'),
  psychiatry: l('Psychiatry', 'Психіатрія'),
  gastroenterology: l('Gastroenterology', 'Гастроентерологія'),
  urology: l('Urology', 'Урологія'),
  family: l('Family Medicine', 'Сімейна медицина'),
} satisfies Record<string, Localized>;

export interface LabTest {
  loinc: string;
  name: Localized;
  unit: string;
  /** Reference range; `female` overrides it for women where ranges differ. */
  low: number;
  high: number;
  female?: { low: number; high: number };
  decimals: number;
  specimen: Localized;
}

const BLOOD = l('Blood', 'Кров');
const SERUM = l('Serum', 'Сироватка');

export const LAB_TESTS = {
  hemoglobin: {
    loinc: '718-7',
    name: l('Hemoglobin', 'Гемоглобін'),
    unit: 'g/L',
    low: 130,
    high: 170,
    female: { low: 120, high: 150 },
    decimals: 0,
    specimen: BLOOD,
  },
  wbc: {
    loinc: '6690-2',
    name: l('White blood cell count', 'Лейкоцити'),
    unit: '10^9/L',
    low: 4,
    high: 10,
    decimals: 1,
    specimen: BLOOD,
  },
  platelets: {
    loinc: '777-3',
    name: l('Platelet count', 'Тромбоцити'),
    unit: '10^9/L',
    low: 150,
    high: 400,
    decimals: 0,
    specimen: BLOOD,
  },
  glucose: {
    loinc: '2345-7',
    name: l('Glucose', 'Глюкоза'),
    unit: 'mmol/L',
    low: 3.9,
    high: 5.6,
    decimals: 1,
    specimen: SERUM,
  },
  hba1c: {
    loinc: '4548-4',
    name: l('Hemoglobin A1c', 'Глікований гемоглобін (HbA1c)'),
    unit: '%',
    low: 4,
    high: 5.6,
    decimals: 1,
    specimen: BLOOD,
  },
  creatinine: {
    loinc: '2160-0',
    name: l('Creatinine', 'Креатинін'),
    unit: 'µmol/L',
    low: 62,
    high: 106,
    female: { low: 44, high: 80 },
    decimals: 0,
    specimen: SERUM,
  },
  egfr: {
    loinc: '33914-3',
    name: l('eGFR', 'ШКФ'),
    unit: 'mL/min/1.73m2',
    low: 90,
    high: 120,
    decimals: 0,
    specimen: SERUM,
  },
  cholesterol: {
    loinc: '2093-3',
    name: l('Total cholesterol', 'Загальний холестерин'),
    unit: 'mmol/L',
    low: 3,
    high: 5.2,
    decimals: 1,
    specimen: SERUM,
  },
  ldl: {
    loinc: '13457-7',
    name: l('LDL cholesterol', 'Холестерин ЛПНЩ'),
    unit: 'mmol/L',
    low: 1,
    high: 3,
    decimals: 1,
    specimen: SERUM,
  },
  crp: {
    loinc: '1988-5',
    name: l('C-reactive protein', 'С-реактивний білок'),
    unit: 'mg/L',
    low: 0,
    high: 5,
    decimals: 1,
    specimen: SERUM,
  },
  tsh: {
    loinc: '3016-3',
    name: l('TSH', 'ТТГ'),
    unit: 'mIU/L',
    low: 0.4,
    high: 4,
    decimals: 2,
    specimen: SERUM,
  },
  ferritin: {
    loinc: '2276-4',
    name: l('Ferritin', 'Феритин'),
    unit: 'µg/L',
    low: 30,
    high: 300,
    female: { low: 15, high: 150 },
    decimals: 0,
    specimen: SERUM,
  },
  troponin: {
    loinc: '67151-1',
    name: l('Troponin T, high-sensitivity', 'Тропонін T, високочутливий'),
    unit: 'ng/L',
    low: 0,
    high: 14,
    decimals: 0,
    specimen: SERUM,
  },
  bnp: {
    loinc: '30934-4',
    name: l('BNP', 'Мозковий натрійуретичний пептид (BNP)'),
    unit: 'pg/mL',
    low: 0,
    high: 100,
    decimals: 0,
    specimen: BLOOD,
  },
  sodium: {
    loinc: '2951-2',
    name: l('Sodium', 'Натрій'),
    unit: 'mmol/L',
    low: 135,
    high: 145,
    decimals: 0,
    specimen: SERUM,
  },
  potassium: {
    loinc: '2823-3',
    name: l('Potassium', 'Калій'),
    unit: 'mmol/L',
    low: 3.5,
    high: 5.1,
    decimals: 1,
    specimen: SERUM,
  },
  alt: {
    loinc: '1742-6',
    name: l('ALT', 'АЛТ'),
    unit: 'U/L',
    low: 7,
    high: 56,
    decimals: 0,
    specimen: SERUM,
  },
} satisfies Record<string, LabTest>;

export type LabKey = keyof typeof LAB_TESTS;

/** Routine panel ordered regardless of diagnosis. */
export const ROUTINE_LABS: LabKey[] = [
  'hemoglobin',
  'wbc',
  'platelets',
  'glucose',
  'creatinine',
  'sodium',
  'potassium',
  'alt',
  'cholesterol',
];

const FORMS = {
  tablet: l('Tablet', 'Таблетка'),
  capsule: l('Capsule', 'Капсула'),
  inhaler: l('Inhaler', 'Інгалятор'),
  injection: l('Solution for injection', "Розчин для ін'єкцій"),
};
const ROUTES = {
  oral: l('Oral', 'Перорально'),
  inhalation: l('Inhalation', 'Інгаляційно'),
  iv: l('Intravenous', 'Внутрішньовенно'),
  sc: l('Subcutaneous', 'Підшкірно'),
};
export const FREQUENCIES = {
  once: l('Once daily', '1 раз на добу'),
  twice: l('Twice daily', '2 рази на добу'),
  thrice: l('Three times daily', '3 рази на добу'),
  prn: l('As needed', 'За потреби'),
};

export interface Medication {
  atc: string;
  name: Localized;
  strengths: string[];
  form: Localized;
  route: Localized;
  frequency: Localized;
  /** Course length in days; null for long-term therapy. */
  courseDays: number | null;
}

const med = (
  atc: string,
  name: Localized,
  strengths: string[],
  form: Localized,
  route: Localized,
  frequency: Localized,
  courseDays: number | null = null,
): Medication => ({ atc, name, strengths, form, route, frequency, courseDays });

const O = ROUTES.oral;
const T = FORMS.tablet;
const F = FREQUENCIES;

export const MEDICATIONS = {
  amlodipine: med(
    'C08CA01',
    l('Amlodipine', 'Амлодипін'),
    ['5 mg', '10 mg'],
    T,
    O,
    F.once,
  ),
  lisinopril: med(
    'C09AA03',
    l('Lisinopril', 'Лізиноприл'),
    ['10 mg', '20 mg'],
    T,
    O,
    F.once,
  ),
  metformin: med(
    'A10BA02',
    l('Metformin', 'Метформін'),
    ['500 mg', '850 mg', '1000 mg'],
    T,
    O,
    F.twice,
  ),
  salbutamol: med(
    'R03AC02',
    l('Salbutamol', 'Сальбутамол'),
    ['100 mcg/dose'],
    FORMS.inhaler,
    ROUTES.inhalation,
    F.prn,
  ),
  budesonide: med(
    'R03BA02',
    l('Budesonide', 'Будесонід'),
    ['200 mcg/dose'],
    FORMS.inhaler,
    ROUTES.inhalation,
    F.twice,
  ),
  amoxiclav: med(
    'J01CR02',
    l('Amoxicillin/clavulanic acid', 'Амоксицилін/клавуланова кислота'),
    ['875/125 mg'],
    T,
    O,
    F.twice,
    7,
  ),
  aspirin: med(
    'B01AC06',
    l('Acetylsalicylic acid', 'Ацетилсаліцилова кислота'),
    ['75 mg', '100 mg'],
    T,
    O,
    F.once,
  ),
  atorvastatin: med(
    'C10AA05',
    l('Atorvastatin', 'Аторвастатин'),
    ['20 mg', '40 mg', '80 mg'],
    T,
    O,
    F.once,
  ),
  clopidogrel: med(
    'B01AC04',
    l('Clopidogrel', 'Клопідогрель'),
    ['75 mg'],
    T,
    O,
    F.once,
    365,
  ),
  furosemide: med(
    'C03CA01',
    l('Furosemide', 'Фуросемід'),
    ['40 mg'],
    T,
    O,
    F.once,
  ),
  bisoprolol: med(
    'C07AB07',
    l('Bisoprolol', 'Бісопролол'),
    ['2.5 mg', '5 mg'],
    T,
    O,
    F.once,
  ),
  nitrofurantoin: med(
    'J01XE01',
    l('Nitrofurantoin', 'Нітрофурантоїн'),
    ['100 mg'],
    FORMS.capsule,
    O,
    F.twice,
    5,
  ),
  ceftriaxone: med(
    'J01DD04',
    l('Ceftriaxone', 'Цефтриаксон'),
    ['1 g', '2 g'],
    FORMS.injection,
    ROUTES.iv,
    F.once,
    7,
  ),
  sertraline: med(
    'N06AB06',
    l('Sertraline', 'Сертралін'),
    ['50 mg', '100 mg'],
    T,
    O,
    F.once,
  ),
  ibuprofen: med(
    'M01AE01',
    l('Ibuprofen', 'Ібупрофен'),
    ['200 mg', '400 mg'],
    T,
    O,
    F.thrice,
    7,
  ),
  paracetamol: med(
    'N02BE01',
    l('Paracetamol', 'Парацетамол'),
    ['500 mg'],
    T,
    O,
    F.prn,
    5,
  ),
  ferrousSulfate: med(
    'B03AA07',
    l('Ferrous sulfate', 'Заліза сульфат'),
    ['200 mg'],
    T,
    O,
    F.once,
    90,
  ),
  levothyroxine: med(
    'H03AA01',
    l('Levothyroxine', 'Левотироксин'),
    ['50 mcg', '100 mcg'],
    T,
    O,
    F.once,
  ),
  tamsulosin: med(
    'G04CA02',
    l('Tamsulosin', 'Тамсулозин'),
    ['0.4 mg'],
    FORMS.capsule,
    O,
    F.once,
  ),
  omeprazole: med(
    'A02BC01',
    l('Omeprazole', 'Омепразол'),
    ['20 mg', '40 mg'],
    FORMS.capsule,
    O,
    F.once,
    28,
  ),
  enoxaparin: med(
    'B01AB05',
    l('Enoxaparin', 'Еноксапарин'),
    ['40 mg'],
    FORMS.injection,
    ROUTES.sc,
    F.once,
    28,
  ),
  ondansetron: med(
    'A04AA01',
    l('Ondansetron', 'Ондансетрон'),
    ['4 mg'],
    T,
    O,
    F.prn,
    3,
  ),
  apixaban: med(
    'B01AF02',
    l('Apixaban', 'Апіксабан'),
    ['2.5 mg', '5 mg'],
    T,
    O,
    F.twice,
  ),
  sumatriptan: med(
    'N02CC01',
    l('Sumatriptan', 'Суматриптан'),
    ['50 mg'],
    T,
    O,
    F.prn,
    30,
  ),
} satisfies Record<string, Medication>;

export type MedicationKey = keyof typeof MEDICATIONS;

export type Sex = 'M' | 'F';

export interface Diagnosis {
  icd10: string;
  name: Localized;
  department: DepartmentKey;
  /** Relative prevalence among records. */
  weight: number;
  ages: [number, number];
  sex?: Sex;
  surgical?: boolean;
  symptoms: Localized[];
  /** Labs this condition pushes out of range, and in which direction. */
  labs: Partial<Record<LabKey, 'high' | 'low'>>;
  medications: MedicationKey[];
  imaging?: { study: Localized; finding: Localized };
}

export const DIAGNOSES: Diagnosis[] = [
  {
    icd10: 'I10',
    name: l(
      'Essential (primary) hypertension',
      'Есенціальна (первинна) гіпертензія',
    ),
    department: 'cardiology',
    weight: 14,
    ages: [35, 95],
    symptoms: [
      l('headaches', 'головний біль'),
      l('dizziness', 'запаморочення'),
    ],
    labs: {},
    medications: ['amlodipine', 'lisinopril'],
  },
  {
    icd10: 'E11.9',
    name: l(
      'Type 2 diabetes mellitus without complications',
      'Цукровий діабет 2 типу без ускладнень',
    ),
    department: 'endocrinology',
    weight: 11,
    ages: [35, 90],
    symptoms: [
      l('increased thirst', 'посилену спрагу'),
      l('frequent urination', 'часте сечовипускання'),
    ],
    labs: { glucose: 'high', hba1c: 'high' },
    medications: ['metformin'],
  },
  {
    icd10: 'J45.9',
    name: l('Asthma, unspecified', 'Астма, неуточнена'),
    department: 'pulmonology',
    weight: 6,
    ages: [18, 80],
    symptoms: [
      l('wheezing', 'свистяче дихання'),
      l('shortness of breath', 'задишку'),
    ],
    labs: {},
    medications: ['salbutamol', 'budesonide'],
  },
  {
    icd10: 'J18.9',
    name: l(
      'Pneumonia, unspecified organism',
      'Пневмонія, збудник неуточнений',
    ),
    department: 'pulmonology',
    weight: 6,
    ages: [18, 95],
    symptoms: [
      l('fever', 'гарячку'),
      l('productive cough', 'продуктивний кашель'),
    ],
    labs: { wbc: 'high', crp: 'high' },
    medications: ['amoxiclav', 'ceftriaxone'],
    imaging: {
      study: l('Chest X-ray', 'Рентгенографія органів грудної клітки'),
      finding: l(
        'right lower lobe consolidation consistent with pneumonia',
        'інфільтрація в нижній частці правої легені, характерна для пневмонії',
      ),
    },
  },
  {
    icd10: 'I21.9',
    name: l(
      'Acute myocardial infarction, unspecified',
      'Гострий інфаркт міокарда, неуточнений',
    ),
    department: 'cardiology',
    weight: 4,
    ages: [40, 95],
    symptoms: [
      l('chest pain', 'біль у грудях'),
      l('diaphoresis', 'пітливість'),
    ],
    labs: { troponin: 'high' },
    medications: ['aspirin', 'atorvastatin', 'clopidogrel', 'bisoprolol'],
  },
  {
    icd10: 'I50.9',
    name: l('Heart failure, unspecified', 'Серцева недостатність, неуточнена'),
    department: 'cardiology',
    weight: 5,
    ages: [50, 95],
    symptoms: [
      l('leg swelling', 'набряки ніг'),
      l('shortness of breath on exertion', 'задишку при навантаженні'),
    ],
    labs: { bnp: 'high' },
    medications: ['furosemide', 'bisoprolol'],
    imaging: {
      study: l('Chest X-ray', 'Рентгенографія органів грудної клітки'),
      finding: l(
        'cardiomegaly with mild pulmonary congestion',
        'кардіомегалія з помірним застоєм у легенях',
      ),
    },
  },
  {
    icd10: 'I48.9',
    name: l(
      'Atrial fibrillation, unspecified',
      'Фібриляція передсердь, неуточнена',
    ),
    department: 'cardiology',
    weight: 4,
    ages: [50, 95],
    symptoms: [l('palpitations', 'серцебиття'), l('fatigue', 'втому')],
    labs: {},
    medications: ['apixaban', 'bisoprolol'],
  },
  {
    icd10: 'N39.0',
    name: l(
      'Urinary tract infection, site not specified',
      'Інфекція сечовивідних шляхів без уточнення локалізації',
    ),
    department: 'family',
    weight: 5,
    ages: [18, 90],
    symptoms: [
      l('dysuria', 'біль при сечовипусканні'),
      l('urinary frequency', 'часте сечовипускання'),
    ],
    labs: { wbc: 'high' },
    medications: ['nitrofurantoin'],
  },
  {
    icd10: 'K35.8',
    name: l(
      'Acute appendicitis, other and unspecified',
      'Гострий апендицит, інший та неуточнений',
    ),
    department: 'surgery',
    weight: 3,
    ages: [18, 60],
    surgical: true,
    symptoms: [
      l('right lower quadrant pain', 'біль у правій здухвинній ділянці'),
      l('nausea', 'нудоту'),
    ],
    labs: { wbc: 'high', crp: 'high' },
    medications: ['ceftriaxone', 'paracetamol'],
    imaging: {
      study: l('CT abdomen and pelvis', 'КТ черевної порожнини та малого таза'),
      finding: l(
        'dilated appendix with periappendiceal fat stranding',
        'розширений апендикс із запальними змінами навколишньої клітковини',
      ),
    },
  },
  {
    icd10: 'E78.5',
    name: l('Hyperlipidaemia, unspecified', 'Гіперліпідемія, неуточнена'),
    department: 'family',
    weight: 8,
    ages: [30, 90],
    symptoms: [l('no specific complaints', 'відсутність специфічних скарг')],
    labs: { cholesterol: 'high', ldl: 'high' },
    medications: ['atorvastatin'],
  },
  {
    icd10: 'F32.9',
    name: l(
      'Depressive episode, unspecified',
      'Депресивний епізод, неуточнений',
    ),
    department: 'psychiatry',
    weight: 5,
    ages: [18, 85],
    symptoms: [
      l('low mood', 'знижений настрій'),
      l('poor sleep', 'порушення сну'),
    ],
    labs: {},
    medications: ['sertraline'],
  },
  {
    icd10: 'M54.5',
    name: l('Low back pain', 'Біль у нижній частині спини'),
    department: 'family',
    weight: 6,
    ages: [18, 85],
    symptoms: [
      l('lower back pain', 'біль у попереку'),
      l('limited mobility', 'обмеження рухливості'),
    ],
    labs: {},
    medications: ['ibuprofen'],
  },
  {
    icd10: 'J06.9',
    name: l(
      'Acute upper respiratory infection, unspecified',
      'Гостра інфекція верхніх дихальних шляхів, неуточнена',
    ),
    department: 'family',
    weight: 7,
    ages: [18, 80],
    symptoms: [l('sore throat', 'біль у горлі'), l('runny nose', 'нежить')],
    labs: {},
    medications: ['paracetamol'],
  },
  {
    icd10: 'D50.9',
    name: l(
      'Iron deficiency anaemia, unspecified',
      'Залізодефіцитна анемія, неуточнена',
    ),
    department: 'internal',
    weight: 4,
    ages: [18, 80],
    sex: 'F',
    symptoms: [l('fatigue', 'втому'), l('pallor', 'блідість')],
    labs: { hemoglobin: 'low', ferritin: 'low' },
    medications: ['ferrousSulfate'],
  },
  {
    icd10: 'N18.3',
    name: l(
      'Chronic kidney disease, stage 3',
      'Хронічна хвороба нирок, стадія 3',
    ),
    department: 'nephrology',
    weight: 3,
    ages: [50, 95],
    symptoms: [l('fatigue', 'втому'), l('ankle swelling', 'набряки гомілок')],
    labs: { creatinine: 'high', egfr: 'low', potassium: 'high' },
    medications: ['lisinopril', 'furosemide'],
  },
  {
    icd10: 'E03.9',
    name: l('Hypothyroidism, unspecified', 'Гіпотиреоз, неуточнений'),
    department: 'endocrinology',
    weight: 4,
    ages: [25, 85],
    sex: 'F',
    symptoms: [
      l('weight gain', 'збільшення ваги'),
      l('cold intolerance', 'непереносимість холоду'),
    ],
    labs: { tsh: 'high' },
    medications: ['levothyroxine'],
  },
  {
    icd10: 'N40',
    name: l(
      'Benign prostatic hyperplasia',
      'Доброякісна гіперплазія передміхурової залози',
    ),
    department: 'urology',
    weight: 3,
    ages: [50, 95],
    sex: 'M',
    symptoms: [
      l('weak urinary stream', 'слабкий струмінь сечі'),
      l('nocturia', 'ніктурію'),
    ],
    labs: {},
    medications: ['tamsulosin'],
  },
  {
    icd10: 'K21.9',
    name: l(
      'Gastro-oesophageal reflux disease without oesophagitis',
      'Гастроезофагеальна рефлюксна хвороба без езофагіту',
    ),
    department: 'gastroenterology',
    weight: 5,
    ages: [18, 85],
    symptoms: [l('heartburn', 'печію'), l('regurgitation', 'відрижку')],
    labs: {},
    medications: ['omeprazole'],
  },
  {
    icd10: 'S72.0',
    name: l('Fracture of neck of femur', 'Перелом шийки стегнової кістки'),
    department: 'orthopedics',
    weight: 2,
    ages: [65, 99],
    surgical: true,
    symptoms: [
      l('hip pain after a fall', 'біль у кульшовому суглобі після падіння'),
      l('inability to bear weight', 'неможливість спертися на ногу'),
    ],
    labs: { hemoglobin: 'low' },
    medications: ['enoxaparin', 'paracetamol'],
    imaging: {
      study: l('X-ray of the hip', 'Рентгенографія кульшового суглоба'),
      finding: l(
        'displaced subcapital fracture of the femoral neck',
        'зміщений субкапітальний перелом шийки стегнової кістки',
      ),
    },
  },
  {
    icd10: 'A09',
    name: l(
      'Infectious gastroenteritis and colitis, unspecified',
      'Інфекційний гастроентерит і коліт, неуточнений',
    ),
    department: 'internal',
    weight: 4,
    ages: [18, 90],
    symptoms: [l('diarrhoea', 'діарею'), l('vomiting', 'блювання')],
    labs: { potassium: 'low', sodium: 'low' },
    medications: ['ondansetron'],
  },
  {
    icd10: 'G43.9',
    name: l('Migraine, unspecified', 'Мігрень, неуточнена'),
    department: 'neurology',
    weight: 4,
    ages: [18, 65],
    symptoms: [
      l('throbbing headache', 'пульсівний головний біль'),
      l('photophobia', 'світлобоязнь'),
    ],
    labs: {},
    medications: ['sumatriptan', 'ibuprofen'],
  },
];

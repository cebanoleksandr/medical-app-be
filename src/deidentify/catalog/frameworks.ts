import { IDENTIFIERS, IdentifierKey } from './identifiers';

export enum Framework {
  HIPAA = 'HIPAA',
  EU_GDPR = 'EU_GDPR',
  UK_GDPR = 'UK_GDPR',
  SWISS_FADP = 'SWISS_FADP',
}

export enum DeidMethod {
  SAFE_HARBOR = 'SAFE_HARBOR',
  EXPERT_DETERMINATION = 'EXPERT_DETERMINATION',
  ANONYMISATION = 'ANONYMISATION',
  CUSTOM = 'CUSTOM',
}

export interface MethodDefinition {
  id: DeidMethod;
  name: string;
  description: string;
  recommended: boolean;
  /** When true the user picks from `identifiers`; otherwise all are applied. */
  customizable: boolean;
  requiresReview: boolean;
  identifiers: IdentifierKey[];
  defaultIdentifiers: IdentifierKey[];
}

export interface FrameworkDefinition {
  id: Framework;
  name: string;
  description: string;
  region: string;
  methods: MethodDefinition[];
}

const HIPAA_18: IdentifierKey[] = [
  'names',
  'geographic',
  'dates',
  'phone',
  'fax',
  'email',
  'ssn',
  'mrn',
  'health_plan',
  'account',
  'license',
  'vehicle',
  'device',
  'url',
  'ip',
  'biometric',
  'photo',
  'other',
];

/** Direct plus common indirect identifiers: what anonymisation must remove. */
const PERSONAL_DATA: IdentifierKey[] = [
  'names',
  'geographic',
  'dates',
  'phone',
  'email',
  'ssn',
  'mrn',
  'health_plan',
  'account',
  'license',
  'vehicle',
  'device',
  'url',
  'ip',
  'other',
  'organization',
  'special_category',
];

function dataProtectionMethods(law: string): MethodDefinition[] {
  return [
    {
      id: DeidMethod.ANONYMISATION,
      name: 'Full anonymisation',
      description: `Removes all direct and common indirect identifiers under ${law}`,
      recommended: true,
      customizable: false,
      requiresReview: false,
      identifiers: PERSONAL_DATA,
      defaultIdentifiers: PERSONAL_DATA,
    },
    {
      id: DeidMethod.CUSTOM,
      name: 'Custom selection',
      description:
        'Choose which identifiers to remove; the result may still be personal data',
      recommended: false,
      customizable: true,
      requiresReview: true,
      identifiers: PERSONAL_DATA,
      defaultIdentifiers: PERSONAL_DATA,
    },
  ];
}

export const FRAMEWORKS: FrameworkDefinition[] = [
  {
    id: Framework.HIPAA,
    name: 'HIPAA',
    description: 'Safe Harbor / Expert Determination',
    region: 'US Healthcare',
    methods: [
      {
        id: DeidMethod.SAFE_HARBOR,
        name: 'Safe Harbor',
        description: 'Automatically removes all 18 HIPAA identifiers',
        recommended: true,
        customizable: false,
        requiresReview: false,
        identifiers: HIPAA_18,
        defaultIdentifiers: HIPAA_18,
      },
      {
        id: DeidMethod.EXPERT_DETERMINATION,
        name: 'Expert Determination',
        description: 'Customize which identifiers to remove',
        recommended: false,
        customizable: true,
        requiresReview: true,
        identifiers: [...HIPAA_18, 'organization', 'special_category'],
        defaultIdentifiers: HIPAA_18,
      },
    ],
  },
  {
    id: Framework.EU_GDPR,
    name: 'EU GDPR',
    description: 'General Data Protection Regulation',
    region: 'European Union',
    methods: dataProtectionMethods('GDPR'),
  },
  {
    id: Framework.UK_GDPR,
    name: 'UK GDPR',
    description: 'UK General Data Protection Regulation',
    region: 'United Kingdom',
    methods: dataProtectionMethods('UK GDPR'),
  },
  {
    id: Framework.SWISS_FADP,
    name: 'Swiss FADP',
    description: 'Federal Act on Data Protection',
    region: 'Switzerland',
    methods: dataProtectionMethods('the revised FADP (nDSG)'),
  },
];

export function findMethod(
  framework: Framework,
  method: DeidMethod,
): MethodDefinition | undefined {
  return FRAMEWORKS.find((f) => f.id === framework)?.methods.find(
    (m) => m.id === method,
  );
}

/** Catalogue as served to the wizard, with identifier labels resolved. */
export function frameworksView() {
  return FRAMEWORKS.map((framework) => ({
    ...framework,
    methods: framework.methods.map((method) => ({
      ...method,
      identifiers: method.identifiers.map((key) => ({
        key,
        label: IDENTIFIERS[key].label,
      })),
    })),
  }));
}

export interface IdentifierDefinition {
  label: string;
  /** Presidio entity types that detect this identifier in free text. */
  entityTypes: string[];
}

/**
 * Every identifier any framework can remove. Keys are stable API values;
 * labels are English defaults the frontend may translate by key.
 */
export const IDENTIFIERS = {
  names: { label: 'Names', entityTypes: ['PERSON'] },
  geographic: {
    label: 'Addresses and geographic locations',
    entityTypes: ['LOCATION'],
  },
  dates: {
    label: 'Dates related to an individual',
    entityTypes: ['DATE_TIME'],
  },
  phone: { label: 'Telephone numbers', entityTypes: ['PHONE_NUMBER'] },
  // Fax numbers are indistinguishable from phones in text.
  fax: { label: 'Fax numbers', entityTypes: ['PHONE_NUMBER'] },
  email: { label: 'Email addresses', entityTypes: ['EMAIL_ADDRESS'] },
  ssn: {
    label: 'Social security and national ID numbers',
    entityTypes: ['US_SSN', 'US_ITIN', 'UA_RNOKPP', 'CH_AHV'],
  },
  mrn: {
    label: 'Medical record numbers',
    entityTypes: ['MEDICAL_RECORD_NUMBER'],
  },
  health_plan: {
    label: 'Health plan and insurance numbers',
    entityTypes: ['HEALTH_PLAN_ID', 'UK_NHS'],
  },
  account: {
    label: 'Account numbers',
    entityTypes: ['IBAN_CODE', 'CREDIT_CARD', 'US_BANK_NUMBER', 'CRYPTO'],
  },
  license: {
    label: 'Certificate, license and ID document numbers',
    entityTypes: [
      'US_DRIVER_LICENSE',
      'US_PASSPORT',
      'UA_PASSPORT',
      'MEDICAL_LICENSE',
    ],
  },
  vehicle: {
    label: 'Vehicle identifiers and serial numbers',
    entityTypes: ['VEHICLE_ID'],
  },
  device: {
    label: 'Device identifiers and serial numbers',
    entityTypes: ['MAC_ADDRESS'],
  },
  url: { label: 'Web URLs', entityTypes: ['URL'] },
  ip: { label: 'IP addresses', entityTypes: ['IP_ADDRESS'] },
  // Not present in text input; listed so the HIPAA catalogue stays complete.
  biometric: { label: 'Biometric identifiers', entityTypes: [] },
  photo: { label: 'Full-face photographs', entityTypes: [] },
  other: {
    label: 'Any other unique identifying number or code',
    entityTypes: ['GENERIC_ID'],
  },
  organization: {
    label: 'Organizations (employers, facilities)',
    entityTypes: ['ORGANIZATION'],
  },
  special_category: {
    label: 'Nationality, religious or political affiliation',
    entityTypes: ['NRP'],
  },
} satisfies Record<string, IdentifierDefinition>;

export type IdentifierKey = keyof typeof IDENTIFIERS;

export const ALL_ENTITY_TYPES = new Set(
  Object.values(IDENTIFIERS).flatMap((i) => i.entityTypes),
);

/** Maps each entity type to the first of `keys` that detects it. */
export function entityTypeIndex(
  keys: readonly IdentifierKey[],
): Map<string, IdentifierKey> {
  const index = new Map<string, IdentifierKey>();
  for (const key of keys) {
    for (const type of IDENTIFIERS[key].entityTypes) {
      if (!index.has(type)) index.set(type, key);
    }
  }
  return index;
}

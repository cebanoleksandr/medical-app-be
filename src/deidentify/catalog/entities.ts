import { Framework } from './frameworks';

/**
 * Per-entity configuration used by the data-protection frameworks (GDPR,
 * UK GDPR, FADP): the user picks a privacy risk level, which presets a
 * method for every entity type, and may override any of them.
 */

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

/** How one entity type is processed. See operators.ts for each one. */
export enum EntityMethod {
  REDACT = 'REDACT',
  PLACEHOLDER = 'PLACEHOLDER',
  TOKEN = 'TOKEN',
  SYNTHETIC = 'SYNTHETIC',
  MASK = 'MASK',
  HASH = 'HASH',
  GENERALISE = 'GENERALISE',
  PSEUDONYMISE = 'PSEUDONYMISE',
  NLP_REDACTION = 'NLP_REDACTION',
}

export interface EntityTypeDefinition {
  /** Presidio entity types detected for this entity type. */
  presidioTypes: string[];
  /** Special category data (GDPR Art. 9, FADP Art. 5(c)): only REDACT. */
  special?: boolean;
}

/**
 * Keys are stable API values. Types with no recognizer yet (GEOPOINT,
 * FREE_TEXT, BIOLOGICAL_DATA, PHOTO) can be configured but detect nothing.
 */
export const ENTITY_TYPES = {
  PERSON: { presidioTypes: ['PERSON'] },
  ORGANIZATION: { presidioTypes: ['ORGANIZATION'] },
  LOCATION: { presidioTypes: ['LOCATION'] },
  DATE_TIME: { presidioTypes: ['DATE_TIME'] },
  IP: { presidioTypes: ['IP_ADDRESS'] },
  GEOPOINT: { presidioTypes: [] },
  NATIONAL_ID: { presidioTypes: ['US_SSN', 'US_ITIN', 'UA_RNOKPP', 'CH_AHV'] },
  ID_NUMBER: { presidioTypes: ['GENERIC_ID', 'US_DRIVER_LICENSE'] },
  PASSPORT: { presidioTypes: ['US_PASSPORT', 'UA_PASSPORT'] },
  CREDIT_CARD: { presidioTypes: ['CREDIT_CARD'] },
  BANK_ACCOUNT: { presidioTypes: ['IBAN_CODE', 'US_BANK_NUMBER', 'CRYPTO'] },
  EMAIL: { presidioTypes: ['EMAIL_ADDRESS'] },
  PHONE: { presidioTypes: ['PHONE_NUMBER'] },
  MEDICAL_RECORD_NUMBER: {
    presidioTypes: ['MEDICAL_RECORD_NUMBER', 'HEALTH_PLAN_ID', 'UK_NHS'],
  },
  DEVICE_ID: { presidioTypes: ['MAC_ADDRESS'] },
  FREE_TEXT: { presidioTypes: [] },
  BIOLOGICAL_DATA: { presidioTypes: [], special: true },
  PHOTO: { presidioTypes: [], special: true },
} satisfies Record<string, EntityTypeDefinition>;

export type EntityType = keyof typeof ENTITY_TYPES;
export type EntityMethods = Record<EntityType, EntityMethod>;

export const ENTITY_TYPE_KEYS = Object.keys(ENTITY_TYPES) as EntityType[];

/** Frameworks configured per entity type instead of with an output mode. */
export const ENTITY_CONFIG_FRAMEWORKS: readonly Framework[] = [
  Framework.EU_GDPR,
  Framework.UK_GDPR,
  Framework.SWISS_FADP,
];

const MEDIUM: EntityMethods = {
  PERSON: EntityMethod.TOKEN,
  ORGANIZATION: EntityMethod.MASK,
  LOCATION: EntityMethod.GENERALISE,
  DATE_TIME: EntityMethod.GENERALISE,
  IP: EntityMethod.GENERALISE,
  GEOPOINT: EntityMethod.GENERALISE,
  NATIONAL_ID: EntityMethod.REDACT,
  ID_NUMBER: EntityMethod.REDACT,
  PASSPORT: EntityMethod.REDACT,
  CREDIT_CARD: EntityMethod.REDACT,
  BANK_ACCOUNT: EntityMethod.REDACT,
  EMAIL: EntityMethod.REDACT,
  PHONE: EntityMethod.REDACT,
  MEDICAL_RECORD_NUMBER: EntityMethod.PSEUDONYMISE,
  DEVICE_ID: EntityMethod.HASH,
  FREE_TEXT: EntityMethod.NLP_REDACTION,
  BIOLOGICAL_DATA: EntityMethod.REDACT,
  PHOTO: EntityMethod.REDACT,
};

/** Methods each risk level starts from. Special categories are always REDACT. */
export const RISK_PRESETS: Record<RiskLevel, EntityMethods> = {
  // Keeps more utility: fakes and partial masks instead of removal.
  [RiskLevel.LOW]: {
    ...MEDIUM,
    PERSON: EntityMethod.SYNTHETIC,
    NATIONAL_ID: EntityMethod.HASH,
    ID_NUMBER: EntityMethod.HASH,
    PASSPORT: EntityMethod.HASH,
    CREDIT_CARD: EntityMethod.MASK,
    BANK_ACCOUNT: EntityMethod.MASK,
    EMAIL: EntityMethod.MASK,
    PHONE: EntityMethod.MASK,
  },
  [RiskLevel.MEDIUM]: MEDIUM,
  // Removes everything except coarse dates and NLP-handled free text.
  [RiskLevel.HIGH]: {
    ...(Object.fromEntries(
      ENTITY_TYPE_KEYS.map((type) => [type, EntityMethod.REDACT]),
    ) as EntityMethods),
    DATE_TIME: EntityMethod.GENERALISE,
    FREE_TEXT: EntityMethod.NLP_REDACTION,
  },
};

/**
 * The preset with the user's overrides on top. Throws a message for a 400
 * when an override is not allowed.
 */
export function resolveEntityMethods(
  level: RiskLevel,
  overrides: Partial<Record<string, string>> = {},
): EntityMethods {
  const methods = { ...RISK_PRESETS[level] };
  for (const [type, method] of Object.entries(overrides)) {
    if (!(type in ENTITY_TYPES)) {
      throw new EntityConfigError(`Unknown entity type ${type}`);
    }
    if (!Object.values<string>(EntityMethod).includes(method ?? '')) {
      throw new EntityConfigError(`Unknown method ${method} for ${type}`);
    }
    const key = type as EntityType;
    if (isSpecial(key) && method !== EntityMethod.REDACT) {
      throw new EntityConfigError(
        `${type} is special category data: only REDACT is permitted`,
      );
    }
    methods[key] = method as EntityMethod;
  }
  return methods;
}

export class EntityConfigError extends Error {}

function isSpecial(type: EntityType): boolean {
  return (ENTITY_TYPES[type] as EntityTypeDefinition).special === true;
}

/** Presidio type → the entity type that configures it. */
export const ENTITY_TYPE_BY_PRESIDIO = new Map<string, EntityType>(
  ENTITY_TYPE_KEYS.flatMap((type) =>
    ENTITY_TYPES[type].presidioTypes.map((p): [string, EntityType] => [
      p,
      type,
    ]),
  ),
);

/** Catalogue as served to the wizard. */
export function entityConfigView() {
  return {
    riskLevels: Object.values(RiskLevel),
    entityMethods: Object.values(EntityMethod),
    entityTypes: ENTITY_TYPE_KEYS.map((type) => ({
      type,
      special: isSpecial(type),
      detectable: ENTITY_TYPES[type].presidioTypes.length > 0,
    })),
    riskPresets: RISK_PRESETS,
  };
}

import {
  ENTITY_TYPE_BY_PRESIDIO,
  ENTITY_TYPE_KEYS,
  EntityConfigError,
  EntityMethod,
  resolveEntityMethods,
  RISK_PRESETS,
  RiskLevel,
} from './entities';

describe('entity configuration', () => {
  it('presets a method for every entity type at every level', () => {
    for (const level of Object.values(RiskLevel)) {
      expect(Object.keys(RISK_PRESETS[level]).sort()).toEqual(
        [...ENTITY_TYPE_KEYS].sort(),
      );
    }
  });

  it('always removes special category data', () => {
    for (const level of Object.values(RiskLevel)) {
      expect(RISK_PRESETS[level].BIOLOGICAL_DATA).toBe(EntityMethod.REDACT);
      expect(RISK_PRESETS[level].PHOTO).toBe(EntityMethod.REDACT);
    }
  });

  it('applies overrides on top of the preset', () => {
    const methods = resolveEntityMethods(RiskLevel.MEDIUM, {
      PERSON: EntityMethod.SYNTHETIC,
    });
    expect(methods.PERSON).toBe(EntityMethod.SYNTHETIC);
    expect(methods.EMAIL).toBe(RISK_PRESETS.MEDIUM.EMAIL);
  });

  it.each([
    [{ BIOLOGICAL_DATA: EntityMethod.MASK }, /special category/],
    [{ SHOE_SIZE: EntityMethod.REDACT }, /Unknown entity type/],
    [{ PERSON: 'SHRED' }, /Unknown method/],
  ])('rejects %j', (overrides, message) => {
    expect(() => resolveEntityMethods(RiskLevel.LOW, overrides)).toThrow(
      EntityConfigError,
    );
    expect(() => resolveEntityMethods(RiskLevel.LOW, overrides)).toThrow(
      message,
    );
  });

  it('maps each Presidio type to one entity type', () => {
    expect(ENTITY_TYPE_BY_PRESIDIO.get('EMAIL_ADDRESS')).toBe('EMAIL');
    expect(ENTITY_TYPE_BY_PRESIDIO.get('IBAN_CODE')).toBe('BANK_ACCOUNT');
  });
});

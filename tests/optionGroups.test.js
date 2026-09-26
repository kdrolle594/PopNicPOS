import { describe, it, expect } from 'vitest';
import { validateOptionGroupPayload } from '../server/routes/optionGroups.js';

const valid = () => ({
  name: 'Soda Flavor', minSelect: 1, maxSelect: 1,
  choices: [{ name: 'Coke', isDefault: true }, { name: 'Sprite', inventoryItemId: 5, inventoryQty: 1 }],
});

describe('validateOptionGroupPayload', () => {
  it('accepts a valid group', () => {
    expect(validateOptionGroupPayload(valid())).toBeNull();
  });
  it('requires a name', () => {
    expect(validateOptionGroupPayload({ ...valid(), name: '  ' })).toBe('name must be 1–80 characters');
  });
  it('checks min/max', () => {
    expect(validateOptionGroupPayload({ ...valid(), minSelect: 2, maxSelect: 1 })).toBe('minSelect cannot be more than maxSelect');
    expect(validateOptionGroupPayload({ ...valid(), maxSelect: 0 })).toBe('maxSelect must be a whole number ≥ 1');
    expect(validateOptionGroupPayload({ ...valid(), minSelect: 0, maxSelect: 3 })).toBe('maxSelect cannot be more than the number of choices');
  });
  it('needs at least one choice', () => {
    expect(validateOptionGroupPayload({ ...valid(), choices: [] })).toBe('a group needs at least one choice');
  });
  it('rejects duplicate choice names regardless of case', () => {
    const body = { ...valid(), choices: [{ name: 'Coke' }, { name: 'coke' }] };
    expect(validateOptionGroupPayload(body)).toBe('choice "coke" appears twice');
  });
  it('needs a positive quantity when stock is linked', () => {
    const body = { ...valid(), choices: [{ name: 'Sprite', inventoryItemId: 5, inventoryQty: 0 }] };
    expect(validateOptionGroupPayload(body)).toBe('inventoryQty must be more than 0 when stock is linked');
  });
  it('limits defaults to maxSelect', () => {
    const body = { ...valid(), choices: [{ name: 'A', isDefault: true }, { name: 'B', isDefault: true }] };
    expect(validateOptionGroupPayload(body)).toBe('at most 1 default choice(s) allowed');
  });
  it('rejects a non-numeric price delta', () => {
    const body = { ...valid(), choices: [{ name: 'A', priceDelta: 'abc' }] };
    expect(validateOptionGroupPayload(body)).toBe('priceDelta must be a number');
  });
});

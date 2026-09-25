import { describe, it, expect } from 'vitest';
import {
  needsCustomization, defaultSelection, selectedChoices, validateSelection,
  linePrice, lineLabel, pruneSelection, toggleChoice, groupHint,
  formatPriceDelta, lineSignature,
} from '../shared/menuOptions.js';

const SIZE = {
  id: 1, name: 'Pizza Size', minSelect: 1, maxSelect: 1,
  choices: [
    { id: 11, name: 'Personal Pan', priceDelta: -2, isDefault: false, available: true },
    { id: 12, name: 'Medium', priceDelta: 0, isDefault: true, available: true },
    { id: 13, name: 'Large', priceDelta: 3, isDefault: false, available: true },
  ],
};
const TOPPINGS = {
  id: 2, name: 'Toppings', minSelect: 0, maxSelect: 2,
  choices: [
    { id: 21, name: 'Pepperoni', priceDelta: 0.1, isDefault: false, available: true },
    { id: 22, name: 'Ham', priceDelta: 0.2, isDefault: false, available: true },
    { id: 23, name: 'Bacon', priceDelta: 0, isDefault: false, available: false },
  ],
};
const SODA_FLAVOR = {
  id: 3, name: 'Soda Flavor', minSelect: 1, maxSelect: 1,
  choices: [
    { id: 31, name: 'Coke', priceDelta: 0, isDefault: false, available: false },
    { id: 32, name: 'Sprite', priceDelta: 0, isDefault: false, available: true },
  ],
};
const PIZZA = { id: 5, name: 'Pizza', price: 14.99, optionGroups: [SIZE, TOPPINGS] };
const SODA = { id: 6, name: 'Soda', price: 1, optionGroups: [SODA_FLAVOR] };
const COFFEE = { id: 7, name: 'Coffee', price: 3.49, optionGroups: [] };

describe('needsCustomization', () => {
  it('is true only when the item has option groups', () => {
    expect(needsCustomization(PIZZA)).toBe(true);
    expect(needsCustomization(COFFEE)).toBe(false);
    expect(needsCustomization({ id: 1, name: 'Old' })).toBe(false);
  });
});

describe('defaultSelection', () => {
  it('uses default choices', () => {
    expect(defaultSelection(PIZZA)).toEqual([12]);
  });
  it('falls back to the first offered choice for a required group with no usable default', () => {
    expect(defaultSelection(SODA)).toEqual([32]);
  });
  it('returns nothing for an item without groups', () => {
    expect(defaultSelection(COFFEE)).toEqual([]);
  });
});

describe('validateSelection', () => {
  it('accepts a valid selection', () => {
    expect(validateSelection(PIZZA, [13, 21, 22])).toEqual({ ok: true, errors: [] });
  });
  it('requires a choice in a required single group', () => {
    const r = validateSelection(SODA, []);
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([{ groupId: 3, message: 'Choose a Soda Flavor' }]);
  });
  it('rejects more than maxSelect', () => {
    const r = validateSelection(PIZZA, [12, 21, 22, 13]);
    expect(r.errors.map((e) => e.message)).toContain('Choose only one Pizza Size');
  });
  it('rejects an unavailable choice by name', () => {
    const r = validateSelection(SODA, [31]);
    expect(r.errors[0].message).toBe('Coke is no longer available');
  });
  it('rejects a choice the item does not offer', () => {
    const r = validateSelection(SODA, [21]);
    expect(r.errors[0].message).toBe("Soda doesn't offer that option");
  });
  it('rejects duplicates', () => {
    const r = validateSelection(PIZZA, [12, 21, 21]);
    expect(r.errors.map((e) => e.message)).toContain('The same option was selected twice');
  });
  it('rejects a sold-out item', () => {
    const r = validateSelection({ ...COFFEE, soldOut: true }, []);
    expect(r.errors[0].message).toBe('Coffee is sold out');
  });
});

describe('price and label', () => {
  it('adds deltas and rounds to cents', () => {
    expect(linePrice(PIZZA, [13, 21, 22])).toBe(18.29);
  });
  it('floors at zero with a negative delta', () => {
    expect(linePrice({ ...PIZZA, price: 1.5 }, [11])).toBe(0);
  });
  it('labels in group then choice order', () => {
    expect(lineLabel(PIZZA, [22, 13, 21])).toBe('Pizza (Large, Pepperoni, Ham)');
    expect(lineLabel(COFFEE, [])).toBe('Coffee');
  });
  it('selectedChoices keeps menu order', () => {
    expect(selectedChoices(PIZZA, [22, 12]).map(({ choice }) => choice.id)).toEqual([12, 22]);
  });
});

describe('pruneSelection', () => {
  it('drops choices that vanished and names them from the previous item', () => {
    const next = { ...SODA, optionGroups: [{ ...SODA_FLAVOR, choices: [SODA_FLAVOR.choices[0]] }] };
    expect(pruneSelection(next, [32], SODA)).toEqual({ choiceIds: [], dropped: ['Sprite'] });
  });
  it('keeps everything still offered', () => {
    expect(pruneSelection(PIZZA, [12, 21])).toEqual({ choiceIds: [12, 21], dropped: [] });
  });
});

describe('toggleChoice', () => {
  it('replaces the pick in a single group', () => {
    expect(toggleChoice(PIZZA, [12, 21], 13)).toEqual([21, 13]);
  });
  it('does not clear a required single choice', () => {
    expect(toggleChoice(PIZZA, [12], 12)).toEqual([12]);
  });
  it('adds and removes in a multi group up to the max', () => {
    expect(toggleChoice(PIZZA, [12], 21)).toEqual([12, 21]);
    expect(toggleChoice(PIZZA, [12, 21, 22], 21)).toEqual([12, 22]);
    expect(toggleChoice(PIZZA, [12, 21, 22], 23)).toEqual([12, 21, 22]);
  });
});

describe('display helpers', () => {
  it('groupHint describes the rule', () => {
    expect(groupHint(SIZE)).toBe('Required');
    expect(groupHint(TOPPINGS)).toBe('Choose up to 2');
    expect(groupHint({ minSelect: 1, maxSelect: 3 })).toBe('Choose 1–3');
    expect(groupHint({ minSelect: 0, maxSelect: 1 })).toBe('Optional');
  });
  it('formatPriceDelta signs the amount', () => {
    expect(formatPriceDelta(3)).toBe('+$3.00');
    expect(formatPriceDelta(-2)).toBe('−$2.00');
  });
  it('lineSignature ignores choice order and type', () => {
    expect(lineSignature(5, [22, '12'])).toBe(lineSignature(5, [12, 22]));
    expect(lineSignature(5, [])).toBe('5|');
  });
});

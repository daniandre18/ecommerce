import { describe, expect, it } from 'vitest';
import { emptyVariant } from '../testing/builders';
import { gtin } from '../value-objects/gtin';
import { hasVariantData, summarizeVariants } from './variant';

const BOX = { length: 300, width: 200, height: 20 };
const physical = { kind: 'physical' as const, weightGrams: null, dimensionsMm: null };

// Historia 4 de la 002: una variante con datos se archiva en lugar de borrarse (FR-024 de la 001).
// Desde la 002 también son datos su GTIN y su peso y dimensiones propios: si se borrara, su GTIN
// quedaría reservado sin una variante de la cual quitarlo, y el código, secuestrado para siempre.
describe('hasVariantData', () => {
  it('una recién generada no tiene datos', () => {
    expect(hasVariantData(emptyVariant('v1'))).toBe(false);
  });

  it.each([
    ['su GTIN', { gtin: gtin('4006381333931') }],
    ['su peso propio', { weightGrams: 450 }],
    ['sus dimensiones propias', { dimensionsMm: BOX }],
  ])('con solo %s, tiene datos', (_label, data) => {
    expect(hasVariantData({ ...emptyVariant('v1'), ...data })).toBe(true);
  });
});

// "Faltan datos de envío" (FR-017) depende de las variantes en circulación: se recalcula junto con el
// resto de lo que el producto resume de ellas, cada vez que cambian.
describe('summarizeVariants', () => {
  const xl = { ...emptyVariant('xl'), weightGrams: 450, dimensionsMm: BOX };
  const m = emptyVariant('m');

  it('cuenta las variantes en circulación y si alguna está incompleta', () => {
    expect(summarizeVariants(physical, [xl, m])).toEqual(expect.objectContaining({ variantCount: 2, hasIncompleteVariants: true }));
  });

  it('a un físico sin peso le faltan datos si alguna variante en circulación no tiene los suyos', () => {
    expect(summarizeVariants(physical, [xl, m]).missingShippingData).toBe(true);
  });

  it('archivada la que no los tenía, ya no faltan', () => {
    expect(summarizeVariants(physical, [xl, { ...m, archived: true }]).missingShippingData).toBe(false);
  });

  it('un digital nunca', () => {
    expect(summarizeVariants({ ...physical, kind: 'digital' }, [m]).missingShippingData).toBe(false);
  });
});

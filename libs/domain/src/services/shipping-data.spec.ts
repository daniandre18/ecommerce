import { describe, expect, it } from 'vitest';
import type { Dimensions } from '../entities/product';
import {
  effectiveShipping,
  missingShippingData,
  type ProductShippingSource,
  type VariantShippingSource,
} from './shipping-data';

const BOX: Dimensions = { length: 300, width: 200, height: 100 };
const BIG: Dimensions = { length: 600, width: 400, height: 200 };

const product = (overrides: Partial<ProductShippingSource> = {}): ProductShippingSource => ({
  kind: 'physical',
  weightGrams: 300,
  dimensionsMm: BOX,
  ...overrides,
});

const variant = (overrides: Partial<VariantShippingSource> = {}): VariantShippingSource => ({
  weightGrams: null,
  dimensionsMm: null,
  archived: false,
  ...overrides,
});

// T009 — FR-015: la variante usa lo propio y, si no tiene, hereda del producto, diciendo de dónde.
describe('effectiveShipping', () => {
  it('sin valor propio, hereda el del producto y lo dice', () => {
    expect(effectiveShipping(product(), variant())).toEqual({
      weightGrams: { value: 300, origin: 'inherited' },
      dimensionsMm: { value: BOX, origin: 'inherited' },
    });
  });

  it('con valor propio, usa el suyo y lo dice', () => {
    expect(effectiveShipping(product(), variant({ weightGrams: 450, dimensionsMm: BIG }))).toEqual({
      weightGrams: { value: 450, origin: 'own' },
      dimensionsMm: { value: BIG, origin: 'own' },
    });
  });

  it('peso y dimensiones se heredan por separado', () => {
    const effective = effectiveShipping(product(), variant({ weightGrams: 450 }));
    expect(effective.weightGrams).toEqual({ value: 450, origin: 'own' });
    expect(effective.dimensionsMm).toEqual({ value: BOX, origin: 'inherited' });
  });

  it('si ni la variante ni el producto lo tienen, el efectivo es nulo heredado', () => {
    expect(effectiveShipping(product({ weightGrams: null }), variant()).weightGrams).toEqual({
      value: null,
      origin: 'inherited',
    });
  });
});

// FR-017: "faltan datos de envío" es una marca del listado, nunca un bloqueo.
describe('missingShippingData', () => {
  it('un físico con peso y dimensiones en todas sus variantes no falta nada', () => {
    expect(missingShippingData(product(), [variant(), variant()])).toBe(false);
  });

  it('un físico sin peso falta', () => {
    expect(missingShippingData(product({ weightGrams: null }), [variant()])).toBe(true);
  });

  it('un físico sin dimensiones falta', () => {
    expect(missingShippingData(product({ dimensionsMm: null }), [variant()])).toBe(true);
  });

  it('basta con UNA variante sin el dato efectivo', () => {
    const p = product({ weightGrams: null });
    expect(missingShippingData(p, [variant({ weightGrams: 450 }), variant()])).toBe(true);
  });

  it('si cada variante tiene el suyo, el producto no necesita tenerlo', () => {
    const p = product({ weightGrams: null, dimensionsMm: null });
    expect(missingShippingData(p, [variant({ weightGrams: 450, dimensionsMm: BIG })])).toBe(false);
  });

  it('una variante archivada no cuenta: no se vende', () => {
    const p = product({ weightGrams: null });
    expect(missingShippingData(p, [variant({ weightGrams: 450 }), variant({ archived: true })])).toBe(false);
  });

  it('un digital nunca falta: no se envía', () => {
    expect(missingShippingData(product({ kind: 'digital', weightGrams: null, dimensionsMm: null }), [variant()])).toBe(false);
  });
});

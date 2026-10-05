import { describe, expect, it } from 'vitest';
import { productId } from '../value-objects/ids';
import { effectiveSaleConditions, saleConditionChanges, type SaleConditionsSource } from './sale-conditions';

const physical = (freeShipping = false, priceVisible = true): SaleConditionsSource => ({
  id: productId('p1'),
  kind: 'physical',
  freeShipping,
  priceVisible,
});

/** Un digital conserva su `freeShipping` guardado (FR-016): no cuenta, pero vuelve si pasa a físico. */
const digital = (freeShipping = false, priceVisible = true): SaleConditionsSource => ({
  id: productId('p1'),
  kind: 'digital',
  freeShipping,
  priceVisible,
});

const shippingChange = (before: string, after: string) => ({
  type: 'sale-conditions.changed',
  field: 'shipping',
  productId: 'p1',
  before,
  after,
});

// T007 — research.md §3: lo que se audita son las condiciones EFECTIVAS, no los campos.
describe('effectiveSaleConditions', () => {
  it.each([
    ['físico sin envío gratis', physical(false), 'charged'],
    ['físico con envío gratis', physical(true), 'free'],
    ['digital', digital(false), 'none'],
    // El caso que comparar campos no captura: el digital no envía aunque tenga `freeShipping` guardado.
    ['digital con envío gratis guardado', digital(true), 'none'],
  ] as const)('%s → envío %s', (_label, product, shipping) => {
    expect(effectiveSaleConditions(product).shipping).toBe(shipping);
  });

  it('el precio mostrado u oculto no depende del tipo', () => {
    expect(effectiveSaleConditions(physical(false, false)).price).toBe('hidden');
    expect(effectiveSaleConditions(digital(false, true)).price).toBe('shown');
  });
});

describe('saleConditionChanges', () => {
  // La tabla completa de research.md §3.
  it.each([
    ['digital → físico sin envío gratis', digital(false), physical(false), 'none', 'charged'],
    ['digital → físico con el envío gratis conservado', digital(true), physical(true), 'none', 'free'],
    ['físico con cargo → digital', physical(false), digital(false), 'charged', 'none'],
    ['físico gratis → digital', physical(true), digital(true), 'free', 'none'],
    ['físico con cargo → físico gratis', physical(false), physical(true), 'charged', 'free'],
    ['físico gratis → físico con cargo', physical(true), physical(false), 'free', 'charged'],
  ] as const)('%s: una entrada de envío %s → %s', (_label, before, after, from, to) => {
    expect(saleConditionChanges(before, after)).toEqual([shippingChange(from, to)]);
  });

  it('mostrar u ocultar el precio deja su propia entrada, independiente del envío', () => {
    expect(saleConditionChanges(physical(false, true), physical(false, false))).toEqual([
      { type: 'sale-conditions.changed', field: 'price', productId: 'p1', before: 'shown', after: 'hidden' },
    ]);
  });

  it('si cambian el precio y el envío a la vez, deja una entrada por cada uno', () => {
    const changes = saleConditionChanges(physical(false, true), digital(false, false));
    expect(changes.map((change) => change.field).sort()).toEqual(['price', 'shipping']);
  });

  it('sin cambio efectivo no deja ninguna entrada', () => {
    expect(saleConditionChanges(physical(true), physical(true))).toEqual([]);
    expect(saleConditionChanges(digital(false), digital(false))).toEqual([]);
  });

  // Un digital no envía: cambiar el `freeShipping` que conserva guardado no cambia nada para el comprador.
  it('cambiar el envío gratis guardado de un digital no deja entrada', () => {
    expect(saleConditionChanges(digital(false), digital(true))).toEqual([]);
  });

  // La propiedad que fija la suite (research.md §3): todo cambio de tipo, en las dos direcciones,
  // produce exactamente una entrada de envío.
  it('todo cambio de tipo produce exactamente una entrada de envío, en las dos direcciones', () => {
    for (const freeShipping of [false, true]) {
      for (const priceVisible of [false, true]) {
        const p = physical(freeShipping, priceVisible);
        const d = digital(freeShipping, priceVisible);
        for (const [before, after] of [[p, d], [d, p]] as const) {
          const shipping = saleConditionChanges(before, after).filter((change) => change.field === 'shipping');
          expect(shipping).toHaveLength(1);
        }
      }
    }
  });
});

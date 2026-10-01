import { describe, expect, it } from 'vitest';
import {
  parseCreateProduct,
  parseSetProductOptions,
  parseSetVariantPrice,
  parseSetVariantStock,
  parseUpdateProductDetails,
} from './parse';

/** Código y campo del `BusinessRuleError` con que falla el parseo. */
function rejection(parse: () => unknown) {
  try {
    parse();
  } catch (error) {
    const { code, details } = error as { code?: string; details?: unknown };
    return { code, details };
  }
  throw new Error('Se esperaba que el parseo fallara');
}

// Borde de las callable: el JSON del cliente se convierte en tipos de dominio o se rechaza.
describe('parseo de la entrada de las callable', () => {
  it('rechaza una carga útil que no es un objeto', () => {
    expect(rejection(() => parseCreateProduct('hola'))).toEqual({ code: 'invalid-argument', details: { field: '(carga útil)' } });
  });

  it('acepta una descripción ausente como vacía', () => {
    expect(parseCreateProduct({ name: 'Camiseta' })).toEqual({ name: 'Camiseta', description: '' });
  });

  it('dice qué campo falta', () => {
    expect(rejection(() => parseCreateProduct({ description: 'x' }))).toEqual({ code: 'invalid-argument', details: { field: 'name' } });
  });

  it('rechaza un id que no es un único segmento', () => {
    expect(rejection(() => parseUpdateProductDetails({ productId: 'p1/../p2', version: 1 }))).toEqual({
      code: 'invalid-argument',
      details: { field: 'productId' },
    });
  });

  it('exige que la versión sea un entero', () => {
    expect(rejection(() => parseUpdateProductDetails({ productId: 'p1', version: 1.5 })).details).toEqual({ field: 'version' });
  });

  describe('importes', () => {
    const price = (amount: unknown, currency: unknown = 'USD') => ({
      productId: 'p1',
      changes: [{ variantId: 'v1', version: 1, price: { amount, currency } }],
    });

    it('construye el dinero como entero en la unidad mínima', () => {
      expect(parseSetVariantPrice(price(129900)).changes[0]?.price).toEqual({ amount: 129900, currency: 'USD' });
    });

    it.each([19.99, -1, '100', null])('rechaza el importe %j', (amount) => {
      expect(rejection(() => parseSetVariantPrice(price(amount))).code).toBe('invalid-argument');
    });

    it('acepta null en el precio comparativo, para quitar el tachado', () => {
      const input = { productId: 'p1', changes: [{ variantId: 'v1', version: 1, compareAtPrice: null }] };
      expect(parseSetVariantPrice(input).changes[0]).toEqual({ variantId: 'v1', version: 1, compareAtPrice: null });
    });

    it('no confunde un campo ausente con null', () => {
      const parsed = parseSetVariantPrice({ productId: 'p1', changes: [{ variantId: 'v1', version: 1 }] });
      expect(parsed.changes[0]).not.toHaveProperty('compareAtPrice');
      expect(parsed.changes[0]).not.toHaveProperty('price');
    });
  });

  describe('existencias (FR-029)', () => {
    const stock = (value: unknown) => ({ productId: 'p1', changes: [{ variantId: 'v1', version: 1, stock: value }] });

    it('distingue "sin definir" de cero', () => {
      expect(parseSetVariantStock(stock({ kind: 'undefined' })).changes[0]?.stock).toEqual({ kind: 'undefined' });
      expect(parseSetVariantStock(stock({ kind: 'quantity', value: 0 })).changes[0]?.stock).toEqual({ kind: 'quantity', value: 0 });
    });

    it.each([{ kind: 'quantity', value: -1 }, { kind: 'quantity', value: 1.5 }, { kind: 'otro' }, 5])('rechaza %j', (value) => {
      expect(rejection(() => parseSetVariantStock(stock(value))).code).toBe('invalid-argument');
    });
  });

  describe('opciones (FR-017)', () => {
    const input = {
      productId: 'p1',
      version: 2,
      options: [
        { id: 'o-talla', name: 'Talla', values: [{ id: 'v-s', label: 'S' }, { id: 'v-m', label: 'M' }] },
        { id: 'o-color', name: 'Color', values: [{ id: 'v-rojo', label: 'Rojo' }] },
      ],
      assignments: [{ variantId: 'var-1', optionId: 'o-color', valueId: 'v-rojo' }],
    };

    it('la posición sale del orden en que llegan opciones y valores', () => {
      const parsed = parseSetProductOptions(input);
      expect(parsed.options.map((o) => [o.id, o.position])).toEqual([['o-talla', 0], ['o-color', 1]]);
      expect(parsed.options[0]?.values.map((v) => [v.label, v.position])).toEqual([['S', 0], ['M', 1]]);
    });

    it('las asignaciones son opcionales', () => {
      const withoutAssignments = { productId: input.productId, version: input.version, options: input.options };
      expect(parseSetProductOptions(withoutAssignments).assignments).toEqual([]);
    });

    it('exige el id de cada opción y de cada valor: los propone el cliente', () => {
      const withoutId = { ...input, options: [{ name: 'Talla', values: [{ id: 'v-s', label: 'S' }] }] };
      expect(rejection(() => parseSetProductOptions(withoutId)).details).toEqual({ field: 'options[0].id' });
    });
  });
});

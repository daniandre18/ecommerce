import { describe, expect, it } from 'vitest';
import type { VariationOption } from '../entities/product';
import type { Variant } from '../entities/variant';
import { optionId, productId, tenantId, valueId, variantId } from '../value-objects/ids';
import { combo, emptyVariant, loadedVariant, option, sequentialIds } from '../testing/builders';
import { reconcileVariants, type Assignment } from './reconcile-variants';

const PRODUCT = { id: productId('p1'), tenantId: tenantId('t1') };
const color = option('color', ['Rojo', 'Amarillo'], 0);
const size = option('size', ['S', 'M'], 1);

/** `from` y `to` son la estructura de opciones antes y después del cambio. */
function reconcile(input: { from: VariationOption[]; to: VariationOption[]; current: Variant[]; assignments?: Assignment[] }) {
  return reconcileVariants({
    product: PRODUCT,
    current: input.current,
    previousOptions: input.from,
    options: input.to,
    assignments: input.assignments ?? [],
    newVariantId: sequentialIds(),
  });
}

const assign = (variant: string, opt: string, label: string): Assignment => ({
  variantId: variantId(variant),
  optionId: optionId(opt),
  valueId: valueId(`${opt}:${label}`),
});

function outcome(result: ReturnType<typeof reconcile>) {
  if (!result.ok) throw new Error(`Se esperaba éxito y hubo ${JSON.stringify(result.error)}`);
  return result.value;
}

// T034 — FR-024, FR-026 y FR-029: el núcleo de la feature.
describe('reconcileVariants', () => {
  describe('agregar una opción a un producto con variantes cargadas (FR-024, prueba central de quickstart)', () => {
    const rojo = loadedVariant('rojo', { color: 'Rojo' });
    const amarillo = loadedVariant('amarillo', { color: 'Amarillo' });
    const result = () =>
      outcome(reconcile({ from: [color], to: [color, size], current: [rojo, amarillo], assignments: [assign('rojo', 'size', 'S'), assign('amarillo', 'size', 'S')] }));

    it('las existentes conservan SKU, precio, comparativo, stock e imágenes: solo cambia su combinación', () => {
      expect(result().preserved).toEqual([
        { ...rojo, optionValues: combo({ color: 'Rojo', size: 'S' }) },
        { ...amarillo, optionValues: combo({ color: 'Amarillo', size: 'S' }) },
      ]);
    });

    it('se crean las combinaciones que faltan', () => {
      expect(result().created.map((v) => v.optionValues)).toEqual([
        combo({ color: 'Rojo', size: 'M' }),
        combo({ color: 'Amarillo', size: 'M' }),
      ]);
    });

    it('las nuevas nacen sin SKU, sin precio y SIN existencias definidas: no en cero (FR-029)', () => {
      for (const created of result().created) {
        expect(created).toEqual(
          expect.objectContaining({ sku: null, price: null, compareAtPrice: null, stock: { kind: 'undefined' }, archived: false }),
        );
      }
    });

    it('no archiva ni descarta nada', () => {
      expect(result().archived).toEqual([]);
      expect(result().discarded).toEqual([]);
    });
  });

  describe('asignaciones', () => {
    it('falta asignar una variante con datos: error que dice cuáles, sin resultados parciales', () => {
      const result = reconcile({
        from: [color],
        to: [color, size],
        current: [loadedVariant('rojo', { color: 'Rojo' }), loadedVariant('amarillo', { color: 'Amarillo' })],
        assignments: [assign('rojo', 'size', 'S')],
      });
      expect(result).toEqual({ ok: false, error: { kind: 'missing-assignments', variantIds: ['amarillo'] } });
    });

    it('una asignación a un valor que no existe en la opción cuenta como faltante', () => {
      const result = reconcile({ from: [color], to: [color, size], current: [loadedVariant('rojo', { color: 'Rojo' })], assignments: [assign('rojo', 'size', 'XL')] });
      expect(result).toEqual({ ok: false, error: { kind: 'missing-assignments', variantIds: ['rojo'] } });
    });

    it('la variante implícita con datos se asigna igual que cualquier otra (FR-020)', () => {
      const implicit = loadedVariant('unica');
      const value = outcome(reconcile({ from: [], to: [color], current: [implicit], assignments: [assign('unica', 'color', 'Rojo')] }));
      expect(value.preserved).toEqual([{ ...implicit, optionValues: combo({ color: 'Rojo' }) }]);
      expect(value.created.map((v) => v.optionValues)).toEqual([combo({ color: 'Amarillo' })]);
    });

    // Sin SKU no hay nada que reservar, y sin precio ni stock no hay entradas de bitácora que la
    // nombren: archivarla dejaría para siempre una variante huérfana con una combinación obsoleta.
    it('una variante sin datos y sin asignar se descarta, no se archiva ni bloquea', () => {
      const value = outcome(reconcile({ from: [], to: [color], current: [emptyVariant('unica')] }));
      expect(value.discarded).toEqual(['unica']);
      expect(value.preserved).toEqual([]);
      expect(value.created.map((v) => v.optionValues)).toEqual([combo({ color: 'Rojo' }), combo({ color: 'Amarillo' })]);
    });
  });

  describe('cambios que no regeneran variantes (FR-026)', () => {
    const rojo = loadedVariant('rojo', { color: 'Rojo' });
    const amarillo = loadedVariant('amarillo', { color: 'Amarillo' });

    it('renombrar una opción o un valor no crea, archiva ni descarta nada', () => {
      const renamed = { ...color, name: 'Colour', values: color.values.map((v) => ({ ...v, label: `${v.label}!` })) };
      const value = outcome(reconcile({ from: [color], to: [renamed], current: [rojo, amarillo] }));
      expect(value.preserved).toEqual([rojo, amarillo]);
      expect(value.created).toEqual([]);
      expect(value.archived).toEqual([]);
    });

    it('sin cambios de estructura, todo se preserva igual', () => {
      const value = outcome(reconcile({ from: [color], to: [color], current: [rojo, amarillo] }));
      expect(value.preserved).toEqual([rojo, amarillo]);
      expect(value.created).toEqual([]);
    });

    it('agregar un valor a una opción existente solo crea su combinación, sin pedir asignaciones', () => {
      const withBlue = option('color', ['Rojo', 'Amarillo', 'Azul']);
      const value = outcome(reconcile({ from: [color], to: [withBlue], current: [rojo, amarillo] }));
      expect(value.created.map((v) => v.optionValues)).toEqual([combo({ color: 'Azul' })]);
    });
  });

  describe('quitar un valor en uso (FR-026)', () => {
    it('archiva las variantes que lo usan, con sus datos y su SKU intactos (FR-023)', () => {
      const rojo = loadedVariant('rojo', { color: 'Rojo' });
      const amarillo = loadedVariant('amarillo', { color: 'Amarillo' });
      const value = outcome(reconcile({ from: [color], to: [option('color', ['Rojo'])], current: [rojo, amarillo] }));
      expect(value.archived).toEqual([{ ...amarillo, archived: true }]);
      expect(value.preserved).toEqual([rojo]);
      expect(value.created).toEqual([]);
    });
  });

  describe('quitar una opción entera: las variantes que coinciden se fusionan', () => {
    it('se conserva la que tiene datos, aunque su valor no sea el primero', () => {
      const rojoS = emptyVariant('rojo-s', { color: 'Rojo', size: 'S' });
      const rojoM = loadedVariant('rojo-m', { color: 'Rojo', size: 'M' });
      const value = outcome(reconcile({ from: [color, size], to: [color], current: [rojoS, rojoM] }));
      expect(value.preserved).toEqual([{ ...rojoM, optionValues: combo({ color: 'Rojo' }) }]);
      expect(value.discarded).toEqual(['rojo-s']); // sin datos: no hay nada que archivar
    });

    it('entre variantes con datos, se conserva la del primer valor y la otra se archiva con su SKU', () => {
      const rojoS = loadedVariant('rojo-s', { color: 'Rojo', size: 'S' });
      const rojoM = loadedVariant('rojo-m', { color: 'Rojo', size: 'M' });
      const value = outcome(reconcile({ from: [color, size], to: [color], current: [rojoS, rojoM] }));
      expect(value.preserved).toEqual([{ ...rojoS, optionValues: combo({ color: 'Rojo' }) }]);
      expect(value.archived).toEqual([{ ...rojoM, archived: true }]);
    });

    it('quitar todas las opciones deja una sola variante implícita (FR-020)', () => {
      const rojo = loadedVariant('rojo', { color: 'Rojo' });
      const amarillo = loadedVariant('amarillo', { color: 'Amarillo' });
      const value = outcome(reconcile({ from: [color], to: [], current: [rojo, amarillo] }));
      expect(value.preserved).toEqual([{ ...rojo, optionValues: {} }]);
      expect(value.archived).toEqual([{ ...amarillo, archived: true }]);
      expect(value.created).toEqual([]);
    });
  });

  it('ignora las variantes ya archivadas: están fuera de circulación', () => {
    const archived = { ...loadedVariant('vieja', { color: 'Rojo' }), archived: true };
    const value = outcome(reconcile({ from: [color], to: [color], current: [archived, emptyVariant('rojo', { color: 'Rojo' })] }));
    expect([...value.preserved, ...value.archived].map((v) => v.id)).not.toContain('vieja');
  });

  it('cada variante creada recibe su propio id, del producto y del comercio correctos', () => {
    const value = outcome(reconcile({ from: [], to: [color], current: [emptyVariant('unica')] }));
    expect(value.created.map((v) => v.id)).toEqual(['new-1', 'new-2']);
    for (const created of value.created) expect(created).toEqual(expect.objectContaining(PRODUCT_FIELDS));
  });
});

const PRODUCT_FIELDS = { productId: 'p1', tenantId: 't1' };

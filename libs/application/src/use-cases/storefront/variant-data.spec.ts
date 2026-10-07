import { gtin, optionId, valueId, type Product, type VariantId, type VariationOption } from '@ecommerce/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { ArchiveVariant } from '../archive';
import { CreateProduct } from '../create-product';
import { SetProductOptions } from '../set-product-options';
import { ctx, failureOf, pid, setup } from '../testing/fixture';
import { UpdateProductDetails } from '../update-product-details';
import { SetVariantGtin } from './set-variant-gtin';
import { SetVariantShipping } from './set-variant-shipping';

const BOX = { length: 300, width: 200, height: 20 };
const size = (labels: string[]): VariationOption => ({
  id: optionId('talle'),
  name: 'Talle',
  position: 0,
  values: labels.map((label, position) => ({ id: valueId(`talle-${label}`), label, position })),
});

// T085 — Historia 4: GTIN por variante (FR-030), peso y dimensiones propios (FR-015) y los datos para
// catálogos externos (FR-031).
describe('datos por variante', () => {
  let t: ReturnType<typeof setup>;
  let setGtin: SetVariantGtin;

  beforeEach(() => {
    t = setup();
    setGtin = new SetVariantGtin();
  });

  /** Un producto con talles; devuelve el id de cada variante por su etiqueta. */
  const withSizes = async (id: string, labels: string[], overrides: Partial<Product> = {}) => {
    await t.run(new CreateProduct(t.deps), { name: `Remera ${id}`, description: '' }, { ...ctx, requestId: id });
    if (Object.keys(overrides).length > 0) t.uow.store.products.set(pid(id), { ...t.product(id), ...overrides });
    await t.run(new SetProductOptions(t.deps), { productId: pid(id), version: t.product(id).version, options: [size(labels)], assignments: [] });
    const byLabel = (label: string): VariantId => {
      // También una archivada: estas pruebas archivan variantes y siguen hablando de ellas.
      const found = t.variantsOf(id).find((v) => v.optionValues[optionId('talle')] === valueId(`talle-${label}`));
      if (!found) throw new Error(`No hay variante ${label}`);
      return found.id;
    };
    return byLabel;
  };
  const version = (product: string, variant: VariantId) => t.variant(product, variant).version;
  const assign = (product: string, variant: VariantId, code: string | null) =>
    t.run(setGtin, { productId: pid(product), variantId: variant, version: version(product, variant), gtin: code });
  const reserved = (code: string) => t.uow.store.gtinIndex.get(gtin(code).normalized);

  describe('SetVariantGtin (FR-030)', () => {
    it('un GTIN de 13 dígitos válido se guarda y queda reservado (escenario 1)', async () => {
      const of = await withSizes('p1', ['S', 'M']);
      await assign('p1', of('S'), '4006381333931');
      expect(t.variant('p1', of('S')).gtin).toEqual({ raw: '4006381333931', normalized: '04006381333931' });
      expect(reserved('4006381333931')).toEqual(expect.objectContaining({ productId: 'p1', variantId: of('S') }));
    });

    it('con el dígito de control mal se rechaza diciendo que no es válido (escenario 2)', async () => {
      const of = await withSizes('p1', ['S', 'M']);
      expect(await failureOf(assign('p1', of('S'), '4006381333932'))).toEqual({ code: 'invalid-gtin', details: { reason: 'check-digit' } });
    });

    it('uno que tiene otra variante se rechaza nombrando el producto (escenario 3)', async () => {
      const of = await withSizes('p1', ['S', 'M']);
      const other = await withSizes('p2', ['L', 'XL']);
      await assign('p2', other('L'), '4006381333931');
      expect(await failureOf(assign('p1', of('S'), '4006381333931'))).toEqual({
        code: 'gtin-conflict',
        details: { productId: 'p2', productName: 'Remera p2', variantId: other('L'), version: version('p2', other('L')), archived: false },
      });
    });

    it('un EAN-13 y el mismo con un cero delante son el mismo código: chocan', async () => {
      const of = await withSizes('p1', ['S', 'M']);
      await assign('p1', of('S'), '4006381333931');
      expect(await failureOf(assign('p1', of('M'), '04006381333931'))).toEqual(expect.objectContaining({ code: 'gtin-conflict' }));
    });

    // Lo que distingue este índice de una unicidad ingenua: archivar NO libera el código.
    it('el GTIN de una variante ARCHIVADA sigue reservado: otra no puede tomarlo, y el rechazo lo dice', async () => {
      const of = await withSizes('p1', ['S', 'M']);
      await assign('p1', of('S'), '4006381333931');
      await t.run(new ArchiveVariant(), { productId: pid('p1'), variantId: of('S'), version: version('p1', of('S')) });
      expect(t.variant('p1', of('S')).archived).toBe(true);

      expect(await failureOf(assign('p1', of('M'), '4006381333931'))).toEqual({
        code: 'gtin-conflict',
        // Con su versión: el panel ofrece quitárselo a la archivada y usarlo acá (FR-030).
        details: { productId: 'p1', productName: 'Remera p1', variantId: of('S'), version: version('p1', of('S')), archived: true },
      });
      expect(reserved('4006381333931')).toEqual(expect.objectContaining({ variantId: of('S') }));
    });

    // La válvula de escape: sin ella, un código de barras real quedaría secuestrado para siempre.
    it('quitar el GTIN de una variante archivada LIBERA el código, y otra puede tomarlo (escenario 8)', async () => {
      const of = await withSizes('p1', ['S', 'M']);
      await assign('p1', of('S'), '4006381333931');
      await t.run(new ArchiveVariant(), { productId: pid('p1'), variantId: of('S'), version: version('p1', of('S')) });

      await assign('p1', of('S'), null);
      expect(t.variant('p1', of('S'))).toEqual(expect.objectContaining({ archived: true, gtin: null }));
      expect(reserved('4006381333931')).toBeUndefined();

      await assign('p1', of('M'), '4006381333931');
      expect(reserved('4006381333931')).toEqual(expect.objectContaining({ variantId: of('M') }));
    });

    it('a una variante archivada no se le asigna uno nuevo: solo se le puede quitar', async () => {
      const of = await withSizes('p1', ['S', 'M']);
      await t.run(new ArchiveVariant(), { productId: pid('p1'), variantId: of('S'), version: version('p1', of('S')) });
      expect(await failureOf(assign('p1', of('S'), '4006381333931'))).toEqual(expect.objectContaining({ code: 'invalid-argument' }));
      expect(reserved('4006381333931')).toBeUndefined();
    });

    it('cambiarlo libera el anterior', async () => {
      const of = await withSizes('p1', ['S', 'M']);
      await assign('p1', of('S'), '4006381333931');
      await assign('p1', of('S'), '96385074');
      expect([reserved('4006381333931'), reserved('96385074')?.variantId]).toEqual([undefined, of('S')]);
    });

    it('volver a poner el que ya tiene no cambia nada', async () => {
      const of = await withSizes('p1', ['S', 'M']);
      await assign('p1', of('S'), '4006381333931');
      const before = t.variant('p1', of('S'));
      await assign('p1', of('S'), '4006381333931');
      expect(t.variant('p1', of('S'))).toEqual(before);
    });

    it('escribir el propio con un cero delante es el mismo código: no choca consigo misma', async () => {
      const of = await withSizes('p1', ['S', 'M']);
      await assign('p1', of('S'), '4006381333931');
      const before = t.variant('p1', of('S'));
      await assign('p1', of('S'), '04006381333931');
      expect(t.variant('p1', of('S'))).toEqual(before);
    });

    it('quitar uno que no tiene no hace nada', async () => {
      const of = await withSizes('p1', ['S', 'M']);
      const before = t.variant('p1', of('S'));
      await assign('p1', of('S'), null);
      expect(t.variant('p1', of('S'))).toEqual(before);
    });

    it('una versión vieja se rechaza y no reserva nada', async () => {
      const of = await withSizes('p1', ['S', 'M']);
      expect(await failureOf(t.run(setGtin, { productId: pid('p1'), variantId: of('S'), version: 99, gtin: '4006381333931' }))).toEqual(
        expect.objectContaining({ code: 'version-conflict' }),
      );
      expect(reserved('4006381333931')).toBeUndefined();
    });

    // Hallado al empezar la Historia 4: una variante con solo GTIN no contaba como "con datos", y al
    // cambiar las opciones se BORRABA, dejando su GTIN reservado sin variante de la cual quitarlo.
    it('al cambiar las opciones, una variante con solo GTIN se archiva, no se borra: el código se puede liberar', async () => {
      const of = await withSizes('p1', ['S', 'M']);
      const s = of('S');
      await assign('p1', s, '4006381333931');
      await t.run(new SetProductOptions(t.deps), { productId: pid('p1'), version: t.product('p1').version, options: [size(['M'])], assignments: [] });

      expect(t.variant('p1', s)).toEqual(expect.objectContaining({ archived: true, gtin: expect.objectContaining({ raw: '4006381333931' }) }));
      await assign('p1', s, null);
      expect(reserved('4006381333931')).toBeUndefined();
    });
  });

  describe('SetVariantShipping (FR-015)', () => {
    let setShipping: SetVariantShipping;

    beforeEach(() => {
      setShipping = new SetVariantShipping();
    });

    const ship = (product: string, changes: { variantId: VariantId; weightGrams?: number | null; dimensionsMm?: typeof BOX | null }[]) =>
      t.run(setShipping, { productId: pid(product), changes: changes.map((c) => ({ ...c, version: version(product, c.variantId) })) });

    it('XL con peso propio; las demás siguen heredando (escenario 4)', async () => {
      const of = await withSizes('p1', ['M', 'XL'], { weightGrams: 300, dimensionsMm: BOX });
      await ship('p1', [{ variantId: of('XL'), weightGrams: 450 }]);
      expect([t.variant('p1', of('XL')).weightGrams, t.variant('p1', of('M')).weightGrams]).toEqual([450, null]);
    });

    it('null vuelve a heredar (escenario 5)', async () => {
      const of = await withSizes('p1', ['M', 'XL'], { weightGrams: 300 });
      await ship('p1', [{ variantId: of('XL'), weightGrams: 450, dimensionsMm: BOX }]);
      await ship('p1', [{ variantId: of('XL'), weightGrams: null }]);
      expect(t.variant('p1', of('XL'))).toEqual(expect.objectContaining({ weightGrams: null, dimensionsMm: BOX }));
    });

    it('recalcula los datos de envío faltantes del producto, sin cambiar su versión (FR-017)', async () => {
      const of = await withSizes('p1', ['M', 'XL']);
      const before = t.product('p1');
      expect(before.missingShippingData).toBe(true);
      await ship('p1', [
        { variantId: of('M'), weightGrams: 300, dimensionsMm: BOX },
        { variantId: of('XL'), weightGrams: 450, dimensionsMm: BOX },
      ]);
      expect([t.product('p1').missingShippingData, t.product('p1').version]).toEqual([false, before.version]);
    });

    it('solo en productos físicos: un digital no lleva peso por variante (escenario 6)', async () => {
      const of = await withSizes('p1', ['M', 'XL'], { kind: 'digital' });
      expect(await failureOf(ship('p1', [{ variantId: of('XL'), weightGrams: 450 }]))).toEqual(expect.objectContaining({ code: 'invalid-argument' }));
    });

    it('enteros mayores que cero, y las tres dimensiones', async () => {
      const of = await withSizes('p1', ['M', 'XL']);
      expect(await failureOf(ship('p1', [{ variantId: of('XL'), weightGrams: 0 }]))).toEqual(expect.objectContaining({ code: 'invalid-argument' }));
      expect(await failureOf(ship('p1', [{ variantId: of('XL'), dimensionsMm: { ...BOX, height: 0 } }]))).toEqual(
        expect.objectContaining({ code: 'invalid-argument' }),
      );
    });

    it('una variante archivada no se edita', async () => {
      const of = await withSizes('p1', ['M', 'XL']);
      await t.run(new ArchiveVariant(), { productId: pid('p1'), variantId: of('XL'), version: version('p1', of('XL')) });
      expect(await failureOf(ship('p1', [{ variantId: of('XL'), weightGrams: 450 }]))).toEqual(expect.objectContaining({ code: 'invalid-argument' }));
    });

    it('una versión vieja rechaza el lote entero', async () => {
      const of = await withSizes('p1', ['M', 'XL']);
      const changes = [
        { variantId: of('M'), version: version('p1', of('M')), weightGrams: 300 },
        { variantId: of('XL'), version: 99, weightGrams: 450 },
      ];
      expect(await failureOf(t.run(setShipping, { productId: pid('p1'), changes }))).toEqual(expect.objectContaining({ code: 'version-conflict' }));
      expect(t.variant('p1', of('M')).weightGrams).toBeNull();
    });
  });

  // Hallado al empezar la Historia 4: con datos de envío por variante, archivar una variante o
  // cambiar las opciones también cambia "Faltan datos de envío", y no se recalculaba.
  describe('"Faltan datos de envío" sigue a las variantes (FR-017)', () => {
    it('archivar la única variante sin datos propios lo quita', async () => {
      const of = await withSizes('p1', ['M', 'XL']);
      await t.run(new SetVariantShipping(), {
        productId: pid('p1'),
        changes: [{ variantId: of('XL'), version: version('p1', of('XL')), weightGrams: 450, dimensionsMm: BOX }],
      });
      expect(t.product('p1').missingShippingData).toBe(true);
      await t.run(new ArchiveVariant(), { productId: pid('p1'), variantId: of('M'), version: version('p1', of('M')) });
      expect(t.product('p1').missingShippingData).toBe(false);
    });

    it('agregar un talle que no tiene los suyos lo vuelve a marcar', async () => {
      const of = await withSizes('p1', ['XL']);
      await t.run(new SetVariantShipping(), {
        productId: pid('p1'),
        changes: [{ variantId: of('XL'), version: version('p1', of('XL')), weightGrams: 450, dimensionsMm: BOX }],
      });
      expect(t.product('p1').missingShippingData).toBe(false);
      await t.run(new SetProductOptions(t.deps), { productId: pid('p1'), version: t.product('p1').version, options: [size(['XL', 'M'])], assignments: [] });
      expect(t.product('p1').missingShippingData).toBe(true);
    });
  });

  describe('catálogos externos en UpdateProductDetails (FR-031)', () => {
    const update = (fields: Record<string, unknown>) =>
      t.run(new UpdateProductDetails(t.deps), { productId: pid('p1'), version: t.product('p1').version, ...fields });

    beforeEach(async () => {
      await t.run(new CreateProduct(t.deps), { name: 'Remera', description: '' }, { ...ctx, requestId: 'p1' });
    });

    it('MPN de hasta 70 caracteres, sin espacios al borde; 71 se rechaza', async () => {
      await update({ mpn: ` ${'a'.repeat(70)} ` });
      expect(t.product('p1').mpn).toBe('a'.repeat(70));
      expect(await failureOf(update({ mpn: 'a'.repeat(71) }))).toEqual(expect.objectContaining({ code: 'invalid-argument' }));
    });

    it('rango de edad y género de las listas cerradas; null los quita (escenario 7)', async () => {
      await update({ ageGroup: 'adult', gender: 'unisex' });
      expect([t.product('p1').ageGroup, t.product('p1').gender]).toEqual(['adult', 'unisex']);
      await update({ ageGroup: null, gender: null, mpn: '' });
      expect([t.product('p1').ageGroup, t.product('p1').gender, t.product('p1').mpn]).toEqual([null, null, null]);
    });

    it('un valor fuera de las listas se rechaza', async () => {
      expect(await failureOf(update({ ageGroup: 'teen' }))).toEqual(expect.objectContaining({ code: 'invalid-argument' }));
      expect(await failureOf(update({ gender: 'otro' }))).toEqual(expect.objectContaining({ code: 'invalid-argument' }));
    });
  });
});

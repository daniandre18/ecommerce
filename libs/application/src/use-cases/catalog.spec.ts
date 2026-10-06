import { normalizeSku, optionId, valueId, type VariationOption } from '@ecommerce/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { ArchiveProduct, ArchiveVariant } from './archive';
import { CreateProduct } from './create-product';
import { SetProductOptions } from './set-product-options';
import { SetProductStatus } from './set-product-status';
import { SetVariantSku } from './set-variant-sku';
import { ctx, failureOf, pid, setup, vid } from './testing/fixture';
import { UpdateProductDetails } from './update-product-details';

const option = (name: string, labels: string[], position = 0): VariationOption => ({
  id: optionId(name),
  name,
  position,
  values: labels.map((label, index) => ({ id: valueId(`${name}-${label}`), label, position: index })),
});
const color = option('color', ['Rojo', 'Amarillo']);
const size = option('size', ['S', 'M'], 1);

describe('casos de uso de catálogo', () => {
  let t: ReturnType<typeof setup>;
  let create: CreateProduct;
  let setOptions: SetProductOptions;
  let setSku: SetVariantSku;

  beforeEach(() => {
    t = setup();
    create = new CreateProduct(t.deps);
    setOptions = new SetProductOptions(t.deps);
    setSku = new SetVariantSku();
  });

  /** Producto `p1` con color (Rojo, Amarillo) y un SKU en cada variante. Devuelve sus ids. */
  async function productWithColors() {
    // CreateProduct usa el requestId como id del producto: así un reintento no lo duplica.
    await t.run(create, { name: 'Camiseta', description: '' }, { ...ctx, requestId: 'p1' });
    await t.run(setOptions, { productId: pid('p1'), version: 1, options: [color], assignments: [] });
    const [rojo, amarillo] = t.variantsOf('p1').map((variant) => variant.id);
    if (!rojo || !amarillo) throw new Error('setOptions no creó las dos variantes de color');
    await t.run(setSku, { productId: pid('p1'), variantId: rojo, version: t.variant('p1', rojo).version, sku: 'CAM-ROJO' });
    await t.run(setSku, { productId: pid('p1'), variantId: amarillo, version: t.variant('p1', amarillo).version, sku: 'CAM-AMA' });
    return { rojo, amarillo };
  }

  describe('CreateProduct (T047, FR-020)', () => {
    it('crea el producto en borrador con una variante implícita incompleta', async () => {
      const { productId } = await t.run(create, { name: '  Café Molido ', description: 'Tostado medio' });
      const product = t.product(productId);
      expect(product).toEqual(
        expect.objectContaining({ name: 'Café Molido', nameNormalized: 'cafe molido', status: 'draft', archived: false, options: [], version: 1 }),
      );
      expect(product).toEqual(expect.objectContaining({ variantCount: 1, hasIncompleteVariants: true }));

      const [implicit] = t.variantsOf(productId);
      expect(implicit).toEqual(expect.objectContaining({ optionValues: {}, sku: null, price: null, stock: { kind: 'undefined' }, version: 1 }));
    });

    it('es idempotente por requestId: reintentar no duplica el producto ni su variante', async () => {
      const first = await t.run(create, { name: 'Camiseta', description: '' });
      const second = await t.run(create, { name: 'Camiseta', description: '' });
      expect(second.productId).toBe(first.productId);
      expect(t.uow.store.products.size).toBe(1);
      expect(t.variantsOf(first.productId)).toHaveLength(1);
    });

    it('rechaza un nombre vacío', async () => {
      expect(await failureOf(t.run(create, { name: '   ', description: '' }))).toEqual(
        expect.objectContaining({ code: 'invalid-argument' }),
      );
    });
  });

  describe('UpdateProductDetails (T047, FR-027)', () => {
    const update = () => new UpdateProductDetails(t.deps);

    it('actualiza nombre y descripción e incrementa la versión', async () => {
      const { productId } = await t.run(create, { name: 'Camiseta', description: '' });
      const result = await t.run(update(), { productId, version: 1, name: 'Remera Ñandú', description: 'Algodón' });
      expect(result.version).toBe(2);
      expect(t.product(productId)).toEqual(expect.objectContaining({ name: 'Remera Ñandú', nameNormalized: 'remera nandu', description: 'Algodón' }));
    });

    it('con una versión desactualizada rechaza en lugar de sobrescribir (FR-027)', async () => {
      const { productId } = await t.run(create, { name: 'Camiseta', description: '' });
      await t.run(update(), { productId, version: 1, name: 'Primera edición' });
      expect(await failureOf(t.run(update(), { productId, version: 1, name: 'Edición pisada' }))).toEqual(
        expect.objectContaining({ code: 'version-conflict' }),
      );
      expect(t.product(productId).name).toBe('Primera edición');
    });

    it('un producto que no existe en el comercio → not-found', async () => {
      expect(await failureOf(t.run(update(), { productId: pid('nada'), version: 1, name: 'x' }))).toEqual(
        expect.objectContaining({ code: 'not-found' }),
      );
    });

    it('una imagen sin texto alternativo se rechaza (FR-038a)', async () => {
      const { productId } = await t.run(create, { name: 'Camiseta', description: '' });
      const images = [{ storagePath: `tenants/t1/products/${productId}/a.jpg`, alt: ' ', position: 0 }];
      expect(await failureOf(t.run(update(), { productId, version: 1, images }))).toEqual(expect.objectContaining({ code: 'invalid-argument' }));
    });

    it('una imagen que apunta a otro producto o comercio se rechaza', async () => {
      const { productId } = await t.run(create, { name: 'Camiseta', description: '' });
      const images = [{ storagePath: 'tenants/t2/products/otro/a.jpg', alt: 'Foto', position: 0 }];
      expect(await failureOf(t.run(update(), { productId, version: 1, images }))).toEqual(expect.objectContaining({ code: 'invalid-argument' }));
    });
  });

  describe('SetProductOptions (T048, FR-024, FR-025, FR-022)', () => {
    it('de la variante implícita sin datos a dos colores: la implícita se descarta y nacen dos incompletas', async () => {
      const { productId } = await t.run(create, { name: 'Camiseta', description: '' });
      const result = await t.run(setOptions, { productId, version: 1, options: [color], assignments: [] });

      expect(result.discarded).toHaveLength(1);
      expect(t.variantsOf(productId).map((v) => v.optionValues)).toEqual([{ color: 'color-Rojo' }, { color: 'color-Amarillo' }]);
      expect(t.product(productId)).toEqual(expect.objectContaining({ options: [color], variantCount: 2, hasIncompleteVariants: true, version: 2 }));
    });

    it('agregar talla conserva SKU de las existentes y crea las que faltan sin existencias definidas', async () => {
      const { rojo, amarillo } = await productWithColors();
      await t.run(setOptions, {
        productId: pid('p1'),
        version: 2,
        options: [color, size],
        assignments: [
          { variantId: rojo, optionId: optionId('size'), valueId: valueId('size-S') },
          { variantId: amarillo, optionId: optionId('size'), valueId: valueId('size-S') },
        ],
      });
      expect(t.variant('p1', rojo).sku?.normalized).toBe('CAM-ROJO');
      expect(t.variant('p1', rojo).optionValues).toEqual({ color: 'color-Rojo', size: 'size-S' });
      const created = t.variantsOf('p1').filter((v) => v.sku === null);
      expect(created).toHaveLength(2);
      for (const v of created) expect(v.stock).toEqual({ kind: 'undefined' });
      expect(t.product('p1').variantCount).toBe(4);
    });

    it('si falta asignar una variante con datos, no se aplica nada y dice cuáles', async () => {
      const { rojo, amarillo } = await productWithColors();
      const before = t.uow.store.clone();
      const failure = await failureOf(
        t.run(setOptions, {
          productId: pid('p1'),
          version: 2,
          options: [color, size],
          assignments: [{ variantId: rojo, optionId: optionId('size'), valueId: valueId('size-S') }],
        }),
      );
      expect(failure).toEqual({ code: 'invalid-argument', details: { kind: 'missing-assignments', variantIds: [amarillo] } });
      expect(t.uow.store.variants).toEqual(before.variants);
      expect(t.uow.store.products).toEqual(before.products);
    });

    it('más de 100 combinaciones → limit-exceeded con la cifra, sin crear nada (FR-025)', async () => {
      const { productId } = await t.run(create, { name: 'Camiseta', description: '' });
      const big = (name: string, position: number) => option(name, Array.from({ length: 11 }, (_, i) => `v${i}`), position);
      const failure = await failureOf(t.run(setOptions, { productId, version: 1, options: [big('a', 0), big('b', 1)], assignments: [] }));
      expect(failure).toEqual({ code: 'limit-exceeded', details: { kind: 'too-many-combinations', max: 100, actual: 121 } });
      expect(t.variantsOf(productId)).toHaveLength(1);
    });

    it('valores repetidos → invalid-argument (FR-022)', async () => {
      const { productId } = await t.run(create, { name: 'Camiseta', description: '' });
      const repeated = { ...color, values: [...color.values, { id: valueId('color-otro'), label: 'rojo', position: 2 }] };
      expect(await failureOf(t.run(setOptions, { productId, version: 1, options: [repeated], assignments: [] }))).toEqual(
        expect.objectContaining({ code: 'invalid-argument' }),
      );
    });

    it('quitar un valor en uso archiva su variante y su SKU queda reservado (FR-023, FR-026)', async () => {
      const { amarillo } = await productWithColors();
      await t.run(setOptions, { productId: pid('p1'), version: 2, options: [option('color', ['Rojo'])], assignments: [] });
      expect(t.variant('p1', amarillo).archived).toBe(true);
      expect(t.uow.store.skuIndex.get('CAM-AMA')).toEqual(expect.objectContaining({ archived: true }));
      expect(t.product('p1').variantCount).toBe(1);
    });

    it('las variantes que no cambian no se reescriben: no provocan conflictos de versión', async () => {
      const { rojo } = await productWithColors();
      const versionBefore = t.variant('p1', rojo).version;
      const withBlue = { ...color, values: [...color.values, { id: valueId('color-Azul'), label: 'Azul', position: 2 }] };
      await t.run(setOptions, { productId: pid('p1'), version: 2, options: [withBlue], assignments: [] });
      expect(t.variant('p1', rojo).version).toBe(versionBefore);
    });

    it('con una versión desactualizada del producto → version-conflict', async () => {
      const { productId } = await t.run(create, { name: 'Camiseta', description: '' });
      expect(await failureOf(t.run(setOptions, { productId, version: 7, options: [color], assignments: [] }))).toEqual(
        expect.objectContaining({ code: 'version-conflict' }),
      );
    });
  });

  describe('SetVariantSku (T049, FR-021)', () => {
    it('asigna el SKU, lo reserva y la variante queda completa', async () => {
      const { productId, variantId } = await t.run(create, { name: 'Camiseta', description: '' });
      const result = await t.run(setSku, { productId, variantId, version: 1, sku: ' cam-01 ' });
      expect(result).toEqual({ version: 2, complete: true });
      expect(t.variant(productId, variantId).sku).toEqual(normalizeSku('cam-01'));
      expect(t.uow.store.skuIndex.get('CAM-01')).toEqual(expect.objectContaining({ variantId, productId }));
    });

    it('el resumen del producto se actualiza sin tocar su versión', async () => {
      const { productId, variantId } = await t.run(create, { name: 'Camiseta', description: '' });
      await t.run(setSku, { productId, variantId, version: 1, sku: 'CAM-01' });
      expect(t.product(productId)).toEqual(expect.objectContaining({ hasIncompleteVariants: false, version: 1 }));
    });

    it('un SKU que ya usa otra variante → sku-conflict, diciendo cuál, aunque cambie la capitalización', async () => {
      const { rojo, amarillo } = await productWithColors();
      const failure = await failureOf(
        t.run(setSku, { productId: pid('p1'), variantId: amarillo, version: t.variant('p1', amarillo).version, sku: 'cam-rojo' }),
      );
      expect(failure).toEqual({ code: 'sku-conflict', details: { occupiedBy: rojo, productId: 'p1' } });
    });

    it('cambiar el SKU libera el anterior: otra variante puede tomarlo', async () => {
      const { rojo, amarillo } = await productWithColors();
      await t.run(setSku, { productId: pid('p1'), variantId: rojo, version: t.variant('p1', rojo).version, sku: 'CAM-ROJO-2' });
      await t.run(setSku, { productId: pid('p1'), variantId: amarillo, version: t.variant('p1', amarillo).version, sku: 'CAM-ROJO' });
      expect(t.variant('p1', amarillo).sku?.normalized).toBe('CAM-ROJO');
    });

    it('el SKU de una variante archivada sigue reservado (FR-023)', async () => {
      const { rojo, amarillo } = await productWithColors();
      await t.run(new ArchiveVariant(), { productId: pid('p1'), variantId: amarillo, version: t.variant('p1', amarillo).version });
      const failure = await failureOf(t.run(setSku, { productId: pid('p1'), variantId: rojo, version: t.variant('p1', rojo).version, sku: 'CAM-AMA' }));
      expect(failure?.code).toBe('sku-conflict');
    });

    it('volver a poner el mismo SKU no es un conflicto', async () => {
      const { rojo } = await productWithColors();
      const v = t.variant('p1', rojo);
      await expect(t.run(setSku, { productId: pid('p1'), variantId: rojo, version: v.version, sku: 'cam-rojo' })).resolves.toEqual(
        expect.objectContaining({ complete: true }),
      );
    });

    it('un SKU inválido → invalid-argument', async () => {
      const { productId, variantId } = await t.run(create, { name: 'Camiseta', description: '' });
      expect(await failureOf(t.run(setSku, { productId, variantId, version: 1, sku: 'a/b' }))).toEqual(
        expect.objectContaining({ code: 'invalid-argument' }),
      );
    });
  });

  describe('SetProductStatus (T049, FR-023a)', () => {
    const setStatus = () => new SetProductStatus(t.deps);

    it('activar con variantes incompletas se rechaza y dice cuáles', async () => {
      const { productId, variantId } = await t.run(create, { name: 'Camiseta', description: '' });
      expect(await failureOf(t.run(setStatus(), { productId, version: 1, status: 'active' }))).toEqual({
        code: 'incomplete-variants',
        details: { kind: 'incomplete-variants', variantIds: [variantId] },
      });
      expect(t.product(productId).status).toBe('draft');
    });

    it('con todas completas, activa e incrementa la versión', async () => {
      const { productId, variantId } = await t.run(create, { name: 'Camiseta', description: '' });
      await t.run(setSku, { productId, variantId, version: 1, sku: 'CAM-01' });
      await expect(t.run(setStatus(), { productId, version: 1, status: 'unlisted' })).resolves.toEqual({ version: 2 });
      expect(t.product(productId).status).toBe('unlisted');
    });
  });

  describe('archivado (T049, FR-023)', () => {
    it('ArchiveProduct archiva sin cambiar el estado', async () => {
      const { productId } = await t.run(create, { name: 'Camiseta', description: '' });
      await t.run(new ArchiveProduct(t.deps), { productId, version: 1 });
      expect(t.product(productId)).toEqual(expect.objectContaining({ archived: true, status: 'draft', version: 2 }));
    });

    it('ArchiveVariant archiva, reserva su SKU y actualiza el resumen', async () => {
      const { amarillo } = await productWithColors();
      await t.run(new ArchiveVariant(), { productId: pid('p1'), variantId: amarillo, version: t.variant('p1', amarillo).version });
      expect(t.variant('p1', amarillo).archived).toBe(true);
      expect(t.uow.store.skuIndex.get('CAM-AMA')?.archived).toBe(true);
      expect(t.product('p1').variantCount).toBe(1);
    });

    it('no se archiva la última variante en circulación: para eso se archiva el producto', async () => {
      const { productId, variantId } = await t.run(create, { name: 'Camiseta', description: '' });
      expect(await failureOf(t.run(new ArchiveVariant(), { productId, variantId, version: 1 }))).toEqual(
        expect.objectContaining({ code: 'invalid-argument' }),
      );
    });

    it('una variante que no existe → not-found', async () => {
      const { productId } = await t.run(create, { name: 'Camiseta', description: '' });
      expect(await failureOf(t.run(new ArchiveVariant(), { productId, variantId: vid('nada'), version: 1 }))).toEqual(
        expect.objectContaining({ code: 'not-found' }),
      );
    });

    // T068 (002, Historia 3) — FR-028: archivar saca el producto de las secciones destacadas, en la
    // misma transacción. Es la única parte de la 002 que cambia código de la 001 ya en uso.
    describe('y las secciones destacadas', () => {
      const sections = () => t.uow.store.sections;

      it('archivar uno que está en Destacados y en Ofertas lo saca de las dos', async () => {
        const { productId } = await t.run(create, { name: 'Camiseta', description: '' });
        t.uow.store.sections = { featured: [pid('otro'), productId], offers: [productId] };
        await t.run(new ArchiveProduct(t.deps), { productId, version: 1 });
        expect(t.product(productId).archived).toBe(true);
        expect(sections()).toEqual({ featured: ['otro'], offers: [] });
      });

      it('si archivar falla, las secciones no cambian: van en la misma transacción', async () => {
        const { productId } = await t.run(create, { name: 'Camiseta', description: '' });
        const before = { featured: [productId], offers: [] };
        t.uow.store.sections = before;
        expect(await failureOf(t.run(new ArchiveProduct(t.deps), { productId, version: 7 }))).toEqual(
          expect.objectContaining({ code: 'version-conflict' }),
        );
        expect(sections()).toBe(before);
      });

      it('archivar uno que no está en ninguna no escribe el documento de secciones', async () => {
        const { productId } = await t.run(create, { name: 'Camiseta', description: '' });
        const before = { featured: [pid('otro')], offers: [] };
        t.uow.store.sections = before;
        await t.run(new ArchiveProduct(t.deps), { productId, version: 1 });
        expect(sections()).toBe(before);
      });

      it('archivar uno ya archivado no cambia nada', async () => {
        const { productId } = await t.run(create, { name: 'Camiseta', description: '' });
        await t.run(new ArchiveProduct(t.deps), { productId, version: 1 });
        const archived = t.product(productId);
        const before = { featured: [productId], offers: [] };
        t.uow.store.sections = before;
        await t.run(new ArchiveProduct(t.deps), { productId, version: 2 });
        expect([t.product(productId), sections()]).toEqual([archived, before]);
        expect(sections()).toBe(before);
      });
    });
  });
});

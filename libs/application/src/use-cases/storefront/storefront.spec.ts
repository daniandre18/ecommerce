import type { Slug } from '@ecommerce/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { CreateProduct } from '../create-product';
import { SetProductStatus } from '../set-product-status';
import { SetVariantSku } from '../set-variant-sku';
import { ctx, failureOf, pid, setup } from '../testing/fixture';
import { UpdateProductDetails } from '../update-product-details';
import { SetProductShipping } from './set-product-shipping';
import { SetProductSlug } from './set-product-slug';
import { SetProductType } from './set-product-type';

const BOX = { length: 300, width: 200, height: 20 };

// T023 — Historia 1: la ficha de tienda de un producto.
describe('ficha de tienda', () => {
  let t: ReturnType<typeof setup>;
  let create: CreateProduct;
  let details: UpdateProductDetails;
  let setSlug: SetProductSlug;
  let setStatus: SetProductStatus;
  let setType: SetProductType;
  let setShipping: SetProductShipping;

  beforeEach(() => {
    t = setup();
    create = new CreateProduct(t.deps);
    details = new UpdateProductDetails(t.deps);
    setSlug = new SetProductSlug(t.deps);
    setStatus = new SetProductStatus(t.deps);
    setType = new SetProductType(t.deps);
    setShipping = new SetProductShipping(t.deps);
  });

  const newProduct = async (id: string, name: string) => {
    await t.run(create, { name, description: 'Algodón peinado, cuello redondo, muy cómoda.' }, { ...ctx, requestId: id });
    return t.product(id);
  };
  const slugEntry = (value: string) => t.uow.store.slugIndex.get(value as Slug);

  /** Publica: hace falta el SKU de la variante implícita (FR-023a). */
  const publish = async (id: string) => {
    const [variant] = t.variantsOf(id);
    if (!variant) throw new Error('sin variante');
    await t.run(new SetVariantSku(), { productId: pid(id), variantId: variant.id, version: variant.version, sku: `SKU-${id}` });
    await t.run(setStatus, { productId: pid(id), version: t.product(id).version, status: 'active' });
  };

  describe('URL amigable al crear (FR-005, FR-006)', () => {
    it('se genera del nombre y queda reservada a su nombre', async () => {
      const product = await newProduct('p1', 'Camiseta Básica Algodón');
      expect(product.slug).toBe('camiseta-basica-algodon');
      expect(slugEntry('camiseta-basica-algodon')).toEqual(expect.objectContaining({ productId: 'p1', kind: 'current' }));
    });

    it('si está tomada, el menor sufijo libre', async () => {
      await newProduct('p1', 'Camiseta');
      await newProduct('p2', 'Camiseta');
      await newProduct('p3', 'camiseta');
      expect([t.product('p2').slug, t.product('p3').slug]).toEqual(['camiseta-2', 'camiseta-3']);
    });

    it('un nombre sin letras ni números recibe la de respaldo, marcada para reemplazar', async () => {
      const product = await newProduct('Qm9c8Zk1xyz', '★★★');
      expect(product.slug).toBe('producto-qm9c8zk1');
      expect(product.slugNeedsReplacement).toBe(true);
    });

    it('nace físico, con precio visible y sin envío gratis (FR-013, FR-026)', async () => {
      expect(await newProduct('p1', 'Camiseta')).toEqual(
        expect.objectContaining({ kind: 'physical', priceVisible: true, freeShipping: false, slugLocked: false, publishedOnce: false }),
      );
    });
  });

  describe('la URL sigue al nombre mientras nadie pudo enlazarla (FR-008)', () => {
    it('en borrador y sin edición manual, renombrar la regenera y libera la anterior', async () => {
      await newProduct('p1', 'Camiseta');
      await t.run(details, { productId: pid('p1'), version: 1, name: 'Remera Lisa' });
      expect(t.product('p1').slug).toBe('remera-lisa');
      expect(slugEntry('camiseta')).toBeUndefined();
    });

    it('una vez publicado, renombrar NO la cambia', async () => {
      await newProduct('p1', 'Camiseta');
      await publish('p1');
      expect(t.product('p1')).toEqual(expect.objectContaining({ slugLocked: true, publishedOnce: true }));
      await t.run(details, { productId: pid('p1'), version: t.product('p1').version, name: 'Remera Lisa' });
      expect(t.product('p1').slug).toBe('camiseta');
    });

    it('editada a mano, renombrar tampoco la cambia', async () => {
      await newProduct('p1', 'Camiseta');
      await t.run(setSlug, { productId: pid('p1'), version: 1, slug: 'mi-camiseta' });
      await t.run(details, { productId: pid('p1'), version: t.product('p1').version, name: 'Remera Lisa' });
      expect(t.product('p1').slug).toBe('mi-camiseta');
    });
  });

  describe('editar la URL (FR-007, FR-008)', () => {
    it('se normaliza con las mismas reglas y devuelve la final', async () => {
      await newProduct('p1', 'Camiseta');
      const result = await t.run(setSlug, { productId: pid('p1'), version: 1, slug: 'Té Verde Orgánico' });
      expect(result.slug).toBe('te-verde-organico');
      expect(t.product('p1')).toEqual(expect.objectContaining({ slug: 'te-verde-organico', slugLocked: true, slugNeedsReplacement: false }));
    });

    it('en uso por otro producto se rechaza, nombrándolo', async () => {
      await newProduct('p1', 'Camiseta');
      await newProduct('p2', 'Remera');
      const failure = await failureOf(t.run(setSlug, { productId: pid('p2'), version: 1, slug: 'camiseta' }));
      expect(failure).toEqual({ code: 'slug-conflict', details: { productId: 'p1' } });
    });

    it('una que no produce ningún carácter válido se rechaza', async () => {
      await newProduct('p1', 'Camiseta');
      expect((await failureOf(t.run(setSlug, { productId: pid('p1'), version: 1, slug: '★★★' })))?.code).toBe('invalid-argument');
    });

    it('nunca publicado: la anterior se libera, nadie la enlazó', async () => {
      await newProduct('p1', 'Camiseta');
      await t.run(setSlug, { productId: pid('p1'), version: 1, slug: 'remera' });
      expect(slugEntry('camiseta')).toBeUndefined();
      await newProduct('p2', 'Camiseta');
      expect(t.product('p2').slug).toBe('camiseta');
    });

    it('publicado alguna vez: la anterior queda reservada a su nombre para redirigir', async () => {
      await newProduct('p1', 'Camiseta');
      await publish('p1');
      await t.run(setSlug, { productId: pid('p1'), version: t.product('p1').version, slug: 'remera' });
      expect(slugEntry('camiseta')).toEqual(expect.objectContaining({ productId: 'p1', kind: 'previous' }));
      await newProduct('p2', 'Camiseta');
      expect(t.product('p2').slug).toBe('camiseta-2');
    });

    it('volver a una anterior propia la recupera como vigente', async () => {
      await newProduct('p1', 'Camiseta');
      await publish('p1');
      await t.run(setSlug, { productId: pid('p1'), version: t.product('p1').version, slug: 'remera' });
      await t.run(setSlug, { productId: pid('p1'), version: t.product('p1').version, slug: 'camiseta' });
      expect(slugEntry('camiseta')).toEqual(expect.objectContaining({ productId: 'p1', kind: 'current' }));
      expect(slugEntry('remera')).toEqual(expect.objectContaining({ productId: 'p1', kind: 'previous' }));
    });

    it('la anterior reservada de otro producto se rechaza', async () => {
      await newProduct('p1', 'Camiseta');
      await publish('p1');
      await t.run(setSlug, { productId: pid('p1'), version: t.product('p1').version, slug: 'remera' });
      await newProduct('p2', 'Polo');
      const failure = await failureOf(t.run(setSlug, { productId: pid('p2'), version: 1, slug: 'camiseta' }));
      expect(failure).toEqual({ code: 'slug-conflict', details: { productId: 'p1' } });
    });

    it('con una versión vieja se rechaza (FR-027 de la 001)', async () => {
      await newProduct('p1', 'Camiseta');
      expect((await failureOf(t.run(setSlug, { productId: pid('p1'), version: 9, slug: 'remera' })))?.code).toBe('version-conflict');
    });
  });

  describe('buscadores, etiquetas, marca y video (FR-009 a FR-012, FR-018)', () => {
    it('acepta título de 70 y descripción de 160, y rechaza 71 y 161', async () => {
      await newProduct('p1', 'Camiseta');
      await t.run(details, { productId: pid('p1'), version: 1, seoTitle: 'a'.repeat(70), seoDescription: 'b'.repeat(160) });
      expect(t.product('p1')).toEqual(expect.objectContaining({ seoTitle: 'a'.repeat(70), seoDescription: 'b'.repeat(160) }));
      const v = t.product('p1').version;
      expect((await failureOf(t.run(details, { productId: pid('p1'), version: v, seoTitle: 'a'.repeat(71) })))?.code).toBe('invalid-argument');
      expect((await failureOf(t.run(details, { productId: pid('p1'), version: v, seoDescription: 'b'.repeat(161) })))?.code).toBe('invalid-argument');
    });

    it('vacíos quedan en null: el panel usa el nombre y la descripción', async () => {
      await newProduct('p1', 'Camiseta');
      await t.run(details, { productId: pid('p1'), version: 1, seoTitle: '   ', seoDescription: '' });
      expect(t.product('p1')).toEqual(expect.objectContaining({ seoTitle: null, seoDescription: null }));
    });

    it('etiquetas sin repetir y con la forma ya registrada en el comercio; el vocabulario las cuenta', async () => {
      await newProduct('p1', 'Camiseta');
      await t.run(details, { productId: pid('p1'), version: 1, tags: ['Algodón', 'Verano'] });
      await newProduct('p2', 'Remera');
      await t.run(details, { productId: pid('p2'), version: 1, tags: ['algodon', 'verano', 'VERANO'] });
      expect(t.product('p2')).toEqual(expect.objectContaining({ tags: ['Algodón', 'Verano'], tagsNormalized: ['algodon', 'verano'] }));
      expect(t.uow.store.vocabulary.tags['algodon']).toEqual({ label: 'Algodón', count: 2 });
    });

    it('quitar una etiqueta resta en el vocabulario y la poda al llegar a cero', async () => {
      await newProduct('p1', 'Camiseta');
      await t.run(details, { productId: pid('p1'), version: 1, tags: ['Verano'] });
      await t.run(details, { productId: pid('p1'), version: 2, tags: [] });
      expect(t.uow.store.vocabulary.tags).toEqual({});
    });

    it('más de 30 etiquetas se rechaza', async () => {
      await newProduct('p1', 'Camiseta');
      const tags = Array.from({ length: 31 }, (_, i) => `t${i}`);
      expect((await failureOf(t.run(details, { productId: pid('p1'), version: 1, tags })))?.code).toBe('invalid-argument');
    });

    it('la marca toma la forma registrada; hasta 70 caracteres', async () => {
      await newProduct('p1', 'Camiseta');
      await t.run(details, { productId: pid('p1'), version: 1, brand: 'Nike' });
      await newProduct('p2', 'Remera');
      await t.run(details, { productId: pid('p2'), version: 1, brand: 'NIKE' });
      expect(t.product('p2')).toEqual(expect.objectContaining({ brand: 'Nike', brandNormalized: 'nike' }));
      expect((await failureOf(t.run(details, { productId: pid('p2'), version: 2, brand: 'x'.repeat(71) })))?.code).toBe('invalid-argument');
    });

    it('el video de una plataforma admitida se guarda con su posición; otro se rechaza', async () => {
      await newProduct('p1', 'Camiseta');
      await t.run(details, { productId: pid('p1'), version: 1, video: { url: 'https://youtu.be/dQw4w9WgXcQ', position: 2 } });
      expect(t.product('p1').video).toEqual({ provider: 'youtube', videoId: 'dQw4w9WgXcQ', position: 2 });
      const failure = await failureOf(t.run(details, { productId: pid('p1'), version: 2, video: { url: 'https://dailymotion.com/video/x1', position: 0 } }));
      expect(failure).toEqual({ code: 'unsupported-video', details: { supported: ['YouTube', 'Vimeo'] } });
      await t.run(details, { productId: pid('p1'), version: 2, video: null });
      expect(t.product('p1').video).toBeNull();
    });
  });

  describe('tipo y envío (FR-013 a FR-017, FR-032)', () => {
    const shippingEntries = () => t.uow.store.audit.filter((entry) => entry.type === 'sale-conditions.changed');

    it('peso y dimensiones solo en un físico; quitan la marca de "faltan datos de envío"', async () => {
      await newProduct('p1', 'Camiseta');
      expect(t.product('p1').missingShippingData).toBe(true);
      await t.run(setShipping, { productId: pid('p1'), version: 1, weightGrams: 300, dimensionsMm: BOX });
      expect(t.product('p1')).toEqual(expect.objectContaining({ weightGrams: 300, dimensionsMm: BOX, missingShippingData: false }));
    });

    it('peso o dimensiones que no son enteros mayores que cero se rechazan', async () => {
      await newProduct('p1', 'Camiseta');
      for (const weightGrams of [0, -5, 12.5]) {
        expect((await failureOf(t.run(setShipping, { productId: pid('p1'), version: 1, weightGrams, dimensionsMm: null })))?.code).toBe('invalid-argument');
      }
      expect((await failureOf(t.run(setShipping, { productId: pid('p1'), version: 1, weightGrams: null, dimensionsMm: { ...BOX, height: 0 } })))?.code).toBe('invalid-argument');
    });

    it('a un digital no se le cargan peso ni dimensiones', async () => {
      await newProduct('p1', 'Licencia');
      await t.run(setType, { productId: pid('p1'), version: 1, kind: 'digital' });
      const failure = await failureOf(t.run(setShipping, { productId: pid('p1'), version: 2, weightGrams: 100, dimensionsMm: null }));
      expect(failure?.code).toBe('invalid-argument');
    });

    it('pasar a digital conserva peso, dimensiones y envío gratis, y deja una entrada de envío', async () => {
      await newProduct('p1', 'Camiseta');
      await t.run(setShipping, { productId: pid('p1'), version: 1, weightGrams: 300, dimensionsMm: BOX });
      const result = await t.run(setType, { productId: pid('p1'), version: 2, kind: 'digital' });
      expect(t.product('p1')).toEqual(expect.objectContaining({ kind: 'digital', weightGrams: 300, dimensionsMm: BOX, missingShippingData: false }));
      expect(result.changes).toEqual([{ field: 'shipping', before: 'charged', after: 'none' }]);
      expect(shippingEntries()).toEqual([
        expect.objectContaining({ field: 'shipping', before: 'charged', after: 'none', entity: { kind: 'product', id: 'p1', productId: 'p1' }, actorUid: 'ana' }),
      ]);
    });

    it('un digital que pasa a físico sin envío gratis previo deja su entrada: el comprador pasa a pagar envío', async () => {
      await newProduct('p1', 'Licencia');
      await t.run(setType, { productId: pid('p1'), version: 1, kind: 'digital' });
      await t.run(setType, { productId: pid('p1'), version: 2, kind: 'physical' });
      expect(shippingEntries().map((entry) => [entry.before, entry.after])).toEqual([
        ['charged', 'none'],
        ['none', 'charged'],
      ]);
    });

    it('elegir el mismo tipo no cambia nada ni deja entrada', async () => {
      await newProduct('p1', 'Camiseta');
      const result = await t.run(setType, { productId: pid('p1'), version: 1, kind: 'physical' });
      expect(result.changes).toEqual([]);
      expect(shippingEntries()).toEqual([]);
      expect(t.product('p1').version).toBe(1);
    });

    it('cambiar el tipo con una versión vieja se rechaza y no deja entrada', async () => {
      await newProduct('p1', 'Camiseta');
      expect((await failureOf(t.run(setType, { productId: pid('p1'), version: 7, kind: 'digital' })))?.code).toBe('version-conflict');
      expect(shippingEntries()).toEqual([]);
    });

    it('la falta de datos de envío NO impide publicar (FR-017)', async () => {
      await newProduct('p1', 'Camiseta');
      await publish('p1');
      expect(t.product('p1')).toEqual(expect.objectContaining({ status: 'active', missingShippingData: true }));
    });
  });

});

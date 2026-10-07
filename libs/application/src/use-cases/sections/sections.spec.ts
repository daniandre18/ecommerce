import { productId, type ProductId } from '@ecommerce/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { ArchiveProduct } from '../archive';
import { CreateProduct } from '../create-product';
import { ctx, failureOf, pid, setup } from '../testing/fixture';
import { AddToSection, RemoveFromSection } from './sections';

const ids = (prefix: string, n: number): ProductId[] => Array.from({ length: n }, (_, i) => productId(`${prefix}${i}`));

// T065 — Historia 3: agregar y quitar de Destacados y Ofertas (FR-027 a FR-027b).
describe('secciones destacadas', () => {
  let t: ReturnType<typeof setup>;
  let add: AddToSection;

  beforeEach(() => {
    t = setup();
    add = new AddToSection();
  });

  const newProduct = (id: string) => t.run(new CreateProduct(t.deps), { name: `Producto ${id}`, description: '' }, { ...ctx, requestId: id });
  const sections = () => t.uow.store.sections;
  /** La sección con `n` productos ya cargados, que existen en el catálogo. */
  const filled = async (section: 'featured' | 'offers', n: number) => {
    for (const id of ids('p', n)) await newProduct(id);
    t.uow.store.sections = { ...sections(), [section]: ids('p', n) };
  };

  it('agrega a una sección y devuelve cuántos lugares ocupa', async () => {
    await newProduct('a');
    expect(await t.run(add, { section: 'featured', productIds: [pid('a')] })).toEqual({ section: 'featured', count: 1 });
    expect(sections()).toEqual({ featured: ['a'], offers: [] });
  });

  it('un producto puede estar en las dos', async () => {
    await newProduct('a');
    await t.run(add, { section: 'featured', productIds: [pid('a')] });
    await t.run(add, { section: 'offers', productIds: [pid('a')] });
    expect(sections()).toEqual({ featured: ['a'], offers: ['a'] });
  });

  it('con 35 en Destacados, agregar 8 rechaza todo con remaining: 5', async () => {
    await filled('featured', 35);
    for (const id of ids('n', 8)) await newProduct(id);
    expect(await failureOf(t.run(add, { section: 'featured', productIds: ids('n', 8) }))).toEqual({
      code: 'section-full',
      details: { section: 'featured', remaining: 5, requested: 8 },
    });
    expect(sections().featured).toEqual(ids('p', 35));
  });

  it('con 40 en Ofertas, el 41 se rechaza y ninguno sale (FR-027b)', async () => {
    await filled('offers', 40);
    await newProduct('n0');
    expect(await failureOf(t.run(add, { section: 'offers', productIds: [pid('n0')] }))).toEqual(
      expect.objectContaining({ code: 'section-full', details: expect.objectContaining({ remaining: 0 }) }),
    );
    expect(sections().offers).toEqual(ids('p', 40));
  });

  it('rechaza productos inexistentes o archivados, sin agregar ninguno', async () => {
    await newProduct('a');
    await newProduct('b');
    await t.run(new ArchiveProduct(t.deps), { productId: pid('b'), version: 1 });
    expect(await failureOf(t.run(add, { section: 'featured', productIds: [pid('a'), pid('nada')] }))).toEqual(
      expect.objectContaining({ code: 'not-found' }),
    );
    expect(await failureOf(t.run(add, { section: 'featured', productIds: [pid('a'), pid('b')] }))).toEqual(
      expect.objectContaining({ code: 'invalid-argument', details: { productIds: ['b'] } }),
    );
    expect(sections().featured).toEqual([]);
  });

  it('agregar los que ya estaban no escribe nada', async () => {
    await newProduct('a');
    await t.run(add, { section: 'featured', productIds: [pid('a')] });
    const before = sections();
    await t.run(add, { section: 'featured', productIds: [pid('a')] });
    expect(sections()).toBe(before);
  });

  it('hasta 40 productos por pedido, y al menos uno', async () => {
    expect(await failureOf(t.run(add, { section: 'featured', productIds: ids('n', 41) }))).toEqual(
      expect.objectContaining({ code: 'limit-exceeded', details: { max: 40, actual: 41 } }),
    );
    expect(await failureOf(t.run(add, { section: 'featured', productIds: [] }))).toEqual(expect.objectContaining({ code: 'invalid-argument' }));
  });

  describe('quitar (FR-027c)', () => {
    it('saca los que están; los que no, se ignoran', async () => {
      await filled('offers', 3);
      expect(await t.run(new RemoveFromSection(), { section: 'offers', productIds: [pid('p1'), pid('nada')] })).toEqual({ section: 'offers', count: 2 });
      expect(sections().offers).toEqual(['p0', 'p2']);
    });

    it('sin nada que quitar no escribe', async () => {
      await filled('offers', 2);
      const before = sections();
      await t.run(new RemoveFromSection(), { section: 'offers', productIds: [pid('nada')] });
      expect(sections()).toBe(before);
    });
  });
});

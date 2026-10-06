import { categoryId, MAX_CATEGORIES_PER_PRODUCT, type CategoryId, type CategoryTree } from '@ecommerce/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryCategoryPruner } from '../../testing/in-memory';
import { CreateProduct } from '../create-product';
import { ctx, failureOf, pid, setup } from '../testing/fixture';
import { AssignCategory, SetProductCategories, UnassignCategory } from './assign';
import { prunePendingCategories } from './prune';
import { CreateCategory, DeleteCategory, MoveCategory, RenameCategory, SetCategoryHidden, SetCategorySlug } from './tree';

const cid = (value: string): CategoryId => categoryId(value);

// T046 — Historia 2: los casos de uso del árbol y de la asignación, sin emulador.
describe('categorías', () => {
  let t: ReturnType<typeof setup>;
  let create: CreateCategory;

  beforeEach(() => {
    t = setup();
    create = new CreateCategory();
  });

  const tree = (): CategoryTree => t.uow.store.categoryTree;
  const node = (key: string) => {
    const found = tree().nodes[cid(key)];
    if (!found) throw new Error(`No existe ${key}`);
    return found;
  };
  const newCategory = (key: string, parent: string | null, name: string, slug?: string) =>
    t.run(create, { parentId: parent === null ? null : cid(parent), name, ...(slug === undefined ? {} : { slug }) }, { ...ctx, requestId: key });

  /** Ropa > Hombre > Camisetas, Ropa > Mujer, Calzado. */
  const seedTree = async () => {
    await newCategory('ropa', null, 'Ropa');
    await newCategory('hombre', 'ropa', 'Hombre');
    await newCategory('camisetas', 'hombre', 'Camisetas');
    await newCategory('mujer', 'ropa', 'Mujer');
    await newCategory('calzado', null, 'Calzado');
  };

  const newProduct = (id: string) => t.run(new CreateProduct(t.deps), { name: `Producto ${id}`, description: '' }, { ...ctx, requestId: id });

  describe('el árbol', () => {
    beforeEach(seedTree);

    it('crear devuelve el id y la URL generada; el id es el requestId', async () => {
      const result = await newCategory('camisas', 'hombre', 'Camisas');
      expect(result).toEqual({ categoryId: 'camisas', slug: 'camisas' });
      expect(node('camisas').parentId).toBe('hombre');
    });

    it('crear es idempotente por requestId: el reintento devuelve la ya creada', async () => {
      const again = await newCategory('camisetas', 'hombre', 'Camisetas');
      expect(again).toEqual({ categoryId: 'camisetas', slug: 'camisetas' });
      expect(Object.keys(tree().nodes)).toHaveLength(5);
    });

    it('"Camisas" en Hombre y en Mujer: camisas y camisas-2 (FR-021)', async () => {
      await newCategory('c1', 'hombre', 'Camisas');
      expect(await newCategory('c2', 'mujer', 'Camisas')).toEqual({ categoryId: 'c2', slug: 'camisas-2' });
    });

    it('una URL escrita a mano se normaliza; tomada, slug-conflict con la categoría que la tiene', async () => {
      expect(await newCategory('c1', 'mujer', 'Camisas', 'Camisas Mujer')).toEqual({ categoryId: 'c1', slug: 'camisas-mujer' });
      expect(await failureOf(newCategory('c2', 'hombre', 'Camisas', 'camisas-mujer'))).toEqual({ code: 'slug-conflict', details: { categoryId: 'c1' } });
      expect(await failureOf(newCategory('c3', 'hombre', 'Camisas', '★'))).toEqual(expect.objectContaining({ code: 'invalid-argument' }));
    });

    it('un cuarto nivel: category-limit con el motivo (FR-019)', async () => {
      expect(await failureOf(newCategory('x', 'camisetas', 'Manga corta'))).toEqual({ code: 'category-limit', details: { reason: 'depth' } });
    });

    it('un nombre repetido entre hermanas: category-name-taken (FR-020)', async () => {
      expect(await failureOf(newCategory('x', 'ropa', 'hombre'))).toEqual(expect.objectContaining({ code: 'category-name-taken' }));
      await expect(newCategory('y', 'calzado', 'Hombre')).resolves.toEqual(expect.objectContaining({ categoryId: 'y' }));
    });

    it('un padre inexistente: not-found; un nombre vacío: invalid-argument', async () => {
      expect(await failureOf(newCategory('x', 'nada', 'X'))).toEqual(expect.objectContaining({ code: 'not-found' }));
      expect(await failureOf(newCategory('x', null, '  '))).toEqual(expect.objectContaining({ code: 'invalid-argument' }));
    });

    it('renombrar no cambia la URL', async () => {
      await t.run(new RenameCategory(), { categoryId: cid('hombre'), name: 'Caballeros' });
      expect(node('hombre')).toEqual(expect.objectContaining({ name: 'Caballeros', slug: 'hombre' }));
    });

    it('editar la URL deja la anterior reservada', async () => {
      expect(await t.run(new SetCategorySlug(), { categoryId: cid('hombre'), slug: 'Caballeros' })).toEqual({ slug: 'caballeros' });
      expect(node('hombre')).toEqual(expect.objectContaining({ slug: 'caballeros', previousSlugs: ['hombre'] }));
      expect(await failureOf(t.run(new SetCategorySlug(), { categoryId: cid('mujer'), slug: 'hombre' }))).toEqual(
        expect.objectContaining({ code: 'slug-conflict' }),
      );
    });

    it('mover dentro de su propia rama: category-limit con motivo cycle', async () => {
      expect(await failureOf(t.run(new MoveCategory(), { categoryId: cid('ropa'), parentId: cid('camisetas'), position: 0 }))).toEqual({
        code: 'category-limit',
        details: { reason: 'cycle' },
      });
    });

    it('mover a otro padre, y reordenar con el mismo', async () => {
      await t.run(new MoveCategory(), { categoryId: cid('camisetas'), parentId: cid('mujer'), position: 0 });
      expect(node('camisetas')).toEqual(expect.objectContaining({ parentId: 'mujer', slug: 'camisetas' }));
      await t.run(new MoveCategory(), { categoryId: cid('mujer'), parentId: cid('ropa'), position: 0 });
      expect([node('mujer').position, node('hombre').position]).toEqual([0, 1]);
    });

    // FR-021a, el cuidado de esta historia a nivel de caso de uso: ocultar y volver a mostrar un padre
    // guarda solo ese nodo, y cada hija conserva su visibilidad, también la oculta por decisión propia.
    it('ocultar un padre y volver a mostrarlo: cada hija conserva la suya', async () => {
      await newCategory('camisas', 'hombre', 'Camisas');
      const hidden = new SetCategoryHidden();
      await t.run(hidden, { categoryId: cid('camisas'), hidden: true });
      const before = tree();

      await t.run(hidden, { categoryId: cid('hombre'), hidden: true });
      expect([node('hombre').hidden, node('camisetas').hidden, node('camisas').hidden]).toEqual([true, false, true]);

      await t.run(hidden, { categoryId: cid('hombre'), hidden: false });
      expect(tree()).toEqual(before);
    });

    it('eliminar con subcategorías: category-has-children (FR-024)', async () => {
      expect(await failureOf(t.run(new DeleteCategory(), { categoryId: cid('hombre') }))).toEqual(
        expect.objectContaining({ code: 'category-has-children' }),
      );
    });

    it('eliminar sin subcategorías no toca los productos y deja el id pendiente de podar', async () => {
      await newProduct('p1');
      await t.run(new AssignCategory(), { categoryId: cid('camisetas'), productIds: [pid('p1')] });
      const product = t.product('p1');

      await t.run(new DeleteCategory(), { categoryId: cid('camisetas') });
      expect(tree().nodes[cid('camisetas')]).toBeUndefined();
      expect(tree().pendingPrune).toEqual(['camisetas']);
      // La transacción del árbol no escribe productos: eso lo hace la poda, después.
      expect(t.product('p1')).toEqual(product);
    });
  });

  describe('asignar a un producto (FR-022)', () => {
    let setCategories: SetProductCategories;

    beforeEach(async () => {
      await seedTree();
      await newProduct('p1');
      setCategories = new SetProductCategories();
    });

    const categoriesOf = (id: string) => t.product(id).categoryIds;
    /** Crea `n` categorías de primer nivel, `extra-0`… */
    const extras = async (n: number) => {
      for (let i = 0; i < n; i++) await newCategory(`extra-${i}`, null, `Extra ${i}`);
      return Array.from({ length: n }, (_, i) => cid(`extra-${i}`));
    };

    it('agrega y quita; asignar a una subcategoría no asigna a sus padres', async () => {
      await t.run(setCategories, { productId: pid('p1'), add: [cid('camisetas'), cid('calzado')], remove: [] });
      expect(categoriesOf('p1')).toEqual(['camisetas', 'calzado']);
      expect(await t.run(setCategories, { productId: pid('p1'), add: [], remove: [cid('calzado')] })).toEqual({ categoryIds: ['camisetas'] });
      expect(categoriesOf('p1')).toEqual(['camisetas']);
    });

    it(`hasta ${MAX_CATEGORIES_PER_PRODUCT}; la 21 se rechaza y no cambia nada`, async () => {
      const ids = await extras(21);
      await t.run(setCategories, { productId: pid('p1'), add: ids.slice(0, 20), remove: [] });
      expect(categoriesOf('p1')).toHaveLength(20);
      expect(await failureOf(t.run(setCategories, { productId: pid('p1'), add: [cid('extra-20')], remove: [] }))).toEqual({
        code: 'limit-exceeded',
        details: { max: 20, actual: 21 },
      });
      expect(categoriesOf('p1')).toHaveLength(20);
    });

    it('una categoría inexistente se rechaza', async () => {
      expect(await failureOf(t.run(setCategories, { productId: pid('p1'), add: [cid('nada')], remove: [] }))).toEqual(
        expect.objectContaining({ code: 'not-found', details: { categoryIds: ['nada'] } }),
      );
    });

    it('no compara ni incrementa la versión del producto, ni su fecha de edición', async () => {
      const before = t.product('p1');
      await t.run(setCategories, { productId: pid('p1'), add: [cid('camisetas')], remove: [] });
      expect([t.product('p1').version, t.product('p1').updatedAt]).toEqual([before.version, before.updatedAt]);
    });

    it('sin nada que agregar ni quitar, o la misma en las dos listas, es un argumento inválido', async () => {
      expect(await failureOf(t.run(setCategories, { productId: pid('p1'), add: [], remove: [] }))).toEqual(expect.objectContaining({ code: 'invalid-argument' }));
      expect(await failureOf(t.run(setCategories, { productId: pid('p1'), add: [cid('ropa')], remove: [cid('ropa')] }))).toEqual(
        expect.objectContaining({ code: 'invalid-argument' }),
      );
    });

    it('el tope cuenta solo las vigentes, y escribir descarta de paso los ids huérfanos', async () => {
      const ids = await extras(20);
      await t.run(setCategories, { productId: pid('p1'), add: ids, remove: [] });
      // Se elimina una: el producto conserva su id hasta la poda, pero ya no cuenta.
      await t.run(new DeleteCategory(), { categoryId: cid('extra-0') });
      expect(categoriesOf('p1')).toHaveLength(20);

      await t.run(setCategories, { productId: pid('p1'), add: [cid('ropa')], remove: [] });
      expect(categoriesOf('p1')).toHaveLength(20);
      expect(categoriesOf('p1')).not.toContain('extra-0');
      expect(categoriesOf('p1')).toContain('ropa');
    });
  });

  describe('asignar y quitar en masa (FR-025)', () => {
    beforeEach(async () => {
      await seedTree();
      for (const id of ['p1', 'p2', 'p3']) await newProduct(id);
    });

    const all = [pid('p1'), pid('p2'), pid('p3')];

    it('asigna a todos sin duplicar a los que ya la tenían', async () => {
      await t.run(new SetProductCategories(), { productId: pid('p1'), add: [cid('mujer')], remove: [] });
      await t.run(new AssignCategory(), { categoryId: cid('mujer'), productIds: all });
      expect(all.map((id) => t.product(id).categoryIds)).toEqual([['mujer'], ['mujer'], ['mujer']]);
    });

    it('quita a todos; a quien no la tenía no le pasa nada', async () => {
      await t.run(new AssignCategory(), { categoryId: cid('mujer'), productIds: [pid('p1'), pid('p2')] });
      await t.run(new UnassignCategory(), { categoryId: cid('mujer'), productIds: all });
      expect(all.map((id) => t.product(id).categoryIds)).toEqual([[], [], []]);
    });

    it('no compara ni incrementa la versión de ningún producto', async () => {
      const before = all.map((id) => t.product(id).version);
      await t.run(new AssignCategory(), { categoryId: cid('mujer'), productIds: all });
      await t.run(new UnassignCategory(), { categoryId: cid('mujer'), productIds: all });
      expect(all.map((id) => t.product(id).version)).toEqual(before);
    });

    it(`si a uno ya no le entra (${MAX_CATEGORIES_PER_PRODUCT}), se rechaza entera y lo nombra`, async () => {
      const ids: CategoryId[] = [];
      for (let i = 0; i < 20; i++) {
        await newCategory(`extra-${i}`, null, `Extra ${i}`);
        ids.push(cid(`extra-${i}`));
      }
      await t.run(new SetProductCategories(), { productId: pid('p2'), add: ids, remove: [] });
      expect(await failureOf(t.run(new AssignCategory(), { categoryId: cid('mujer'), productIds: all }))).toEqual({
        code: 'limit-exceeded',
        details: { max: 20, productIds: ['p2'] },
      });
      expect(t.product('p1').categoryIds).toEqual([]);
    });

    it('a una categoría o un producto inexistente se rechaza', async () => {
      expect(await failureOf(t.run(new AssignCategory(), { categoryId: cid('nada'), productIds: all }))).toEqual(expect.objectContaining({ code: 'not-found' }));
      expect(await failureOf(t.run(new AssignCategory(), { categoryId: cid('mujer'), productIds: [pid('p1'), pid('nada')] }))).toEqual(
        expect.objectContaining({ code: 'not-found' }),
      );
    });

    it('hasta 100 productos por acción, sin lista vacía', async () => {
      const many = Array.from({ length: 101 }, (_, i) => pid(`p${i}`));
      expect(await failureOf(t.run(new AssignCategory(), { categoryId: cid('mujer'), productIds: many }))).toEqual(
        expect.objectContaining({ code: 'limit-exceeded', details: { max: 100, actual: 101 } }),
      );
      expect(await failureOf(t.run(new UnassignCategory(), { categoryId: cid('mujer'), productIds: [] }))).toEqual(
        expect.objectContaining({ code: 'invalid-argument' }),
      );
    });

    // research §2: el editor envía lo que agrega y lo que quita, nunca el conjunto completo. Así dos
    // escrituras sobre el mismo producto conmutan: quedan los dos efectos, en cualquier orden.
    it.each([
      ['la masiva primero', true],
      ['el editor primero', false],
    ])('concurrencia: el editor quita A mientras una masiva agrega B, y quedan los dos efectos (%s)', async (_label, bulkFirst) => {
      await t.run(new SetProductCategories(), { productId: pid('p1'), add: [cid('ropa')], remove: [] });
      // Los dos partieron de ver el producto con [ropa].
      const editor = () => t.run(new SetProductCategories(), { productId: pid('p1'), add: [], remove: [cid('ropa')] });
      const bulk = () => t.run(new AssignCategory(), { categoryId: cid('calzado'), productIds: [pid('p1')] });
      if (bulkFirst) {
        await bulk();
        await editor();
      } else {
        await editor();
        await bulk();
      }
      expect(t.product('p1').categoryIds).toEqual(['calzado']);
    });
  });

  describe('poda convergente (research §2, FR-024)', () => {
    beforeEach(async () => {
      await seedTree();
      for (const id of ['p1', 'p2']) await newProduct(id);
      await t.run(new AssignCategory(), { categoryId: cid('camisetas'), productIds: [pid('p1'), pid('p2')] });
      await t.run(new AssignCategory(), { categoryId: cid('calzado'), productIds: [pid('p1')] });
    });

    it('quita el id de los productos, solo ese campo, y vacía las pendientes', async () => {
      const before = t.product('p1');
      await t.run(new DeleteCategory(), { categoryId: cid('camisetas') });
      await prunePendingCategories(t.uow, new InMemoryCategoryPruner(t.uow));
      expect([t.product('p1').categoryIds, t.product('p2').categoryIds]).toEqual([['calzado'], []]);
      expect(t.product('p1')).toEqual({ ...before, categoryIds: ['calzado'] });
      expect(tree().pendingPrune).toEqual([]);
    });

    it('cortada a la mitad, las pendientes quedan; la siguiente la termina', async () => {
      await t.run(new DeleteCategory(), { categoryId: cid('camisetas') });
      const failing = new InMemoryCategoryPruner(t.uow, { batchSize: 1, failAfterBatches: 1 });
      await expect(prunePendingCategories(t.uow, failing)).rejects.toThrow();
      expect(tree().pendingPrune).toEqual(['camisetas']);
      expect([t.product('p1').categoryIds, t.product('p2').categoryIds].flat().filter((id) => id === 'camisetas')).toHaveLength(1);

      await prunePendingCategories(t.uow, new InMemoryCategoryPruner(t.uow));
      expect(tree().pendingPrune).toEqual([]);
      expect(t.product('p2').categoryIds).toEqual([]);
    });

    it('sin pendientes no escribe nada', async () => {
      const before = { tree: tree(), products: [t.product('p1'), t.product('p2')] };
      await prunePendingCategories(t.uow, new InMemoryCategoryPruner(t.uow));
      expect({ tree: tree(), products: [t.product('p1'), t.product('p2')] }).toEqual(before);
    });

    it('una eliminada mientras se podaba otra no se pierde de las pendientes', async () => {
      await t.run(new DeleteCategory(), { categoryId: cid('camisetas') });
      const pruner = new InMemoryCategoryPruner(t.uow);
      // Entre la poda y su cierre, otra persona elimina Calzado: su id tiene que seguir pendiente.
      const prune = pruner.prune.bind(pruner);
      pruner.prune = async (ids) => {
        await prune(ids);
        await t.run(new DeleteCategory(), { categoryId: cid('calzado') });
      };
      await prunePendingCategories(t.uow, pruner);
      expect(tree().pendingPrune).toEqual(['calzado']);
    });
  });
});

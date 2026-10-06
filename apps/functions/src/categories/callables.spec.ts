import { categoryId, createCustomRole, productId, roleId } from '@ecommerce/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogCallables } from '../catalog/callables';
import { AT, callAs, callRequest, harness, httpsErrorCode, member, T1 } from '../testing/harness';
import { categoryCallables } from './callables';

type Harness = ReturnType<typeof harness>;

const NAMES = [
  'createCategory',
  'renameCategory',
  'setCategorySlug',
  'moveCategory',
  'setCategoryHidden',
  'deleteCategory',
  'setProductCategories',
  'assignCategory',
  'unassignCategory',
] as const;

// T047 — Historia 2: las callable del árbol y de la asignación, cada una su caso de uso detrás de la
// guarda (FR-002, SC-004), y la poda de las eliminadas DESPUÉS de confirmar (research §2).
describe('callable de categorías', () => {
  let h: Harness;
  let categories: ReturnType<typeof categoryCallables>;

  beforeEach(async () => {
    h = harness();
    categories = categoryCallables(h.deps);
    const created = await catalogCallables(h.deps).createProduct.run(callAs('owner', { requestId: 'p1', name: 'Camiseta', description: '' }));
    if (!created.ok) throw new Error(JSON.stringify(created));
  });

  const tree = () => h.t1.store.categoryTree;
  const product = () => h.t1.store.products.get(productId('p1'));
  const create = (key: string, parentId: string | null, name: string) =>
    categories.createCategory.run(callAs('ana', { requestId: key, parentId, name }));

  it('el rol de Catálogo arma el árbol y asigna (FR-002)', async () => {
    await expect(create('ropa', null, 'Ropa')).resolves.toEqual({ ok: true, data: { categoryId: 'ropa', slug: 'ropa' } });
    await create('hombre', 'ropa', 'Hombre');
    await expect(categories.renameCategory.run(callAs('ana', { categoryId: 'hombre', name: 'Caballeros' }))).resolves.toEqual(
      expect.objectContaining({ ok: true }),
    );
    await expect(categories.setCategorySlug.run(callAs('ana', { categoryId: 'hombre', slug: 'caballeros' }))).resolves.toEqual({
      ok: true,
      data: { slug: 'caballeros' },
    });
    await categories.moveCategory.run(callAs('ana', { categoryId: 'hombre', parentId: null, position: 0 }));
    await categories.setCategoryHidden.run(callAs('ana', { categoryId: 'hombre', hidden: true }));
    expect(tree().nodes[categoryId('hombre')]).toEqual(expect.objectContaining({ parentId: null, hidden: true, slug: 'caballeros' }));

    await expect(categories.setProductCategories.run(callAs('ana', { productId: 'p1', add: ['ropa'], remove: [] }))).resolves.toEqual({
      ok: true,
      data: { categoryIds: ['ropa'] },
    });
    await categories.assignCategory.run(callAs('ana', { categoryId: 'hombre', productIds: ['p1'] }));
    await categories.unassignCategory.run(callAs('ana', { categoryId: 'ropa', productIds: ['p1'] }));
    expect(product()?.categoryIds).toEqual(['hombre']);
  });

  // FR-021a de punta a punta por la callable: ocultar y volver a mostrar un padre escribe solo ese
  // nodo; cada hija conserva su visibilidad, también la que ya estaba oculta por decisión propia.
  it('ocultar un padre y volver a mostrarlo: cada hija conserva la suya', async () => {
    await create('ropa', null, 'Ropa');
    await create('hombre', 'ropa', 'Hombre');
    await create('camisetas', 'hombre', 'Camisetas');
    await create('camisas', 'hombre', 'Camisas');
    await categories.setCategoryHidden.run(callAs('ana', { categoryId: 'camisas', hidden: true }));
    const before = tree();
    const own = () => ['hombre', 'camisetas', 'camisas'].map((key) => tree().nodes[categoryId(key)]?.hidden);

    await categories.setCategoryHidden.run(callAs('ana', { categoryId: 'hombre', hidden: true }));
    expect(own()).toEqual([true, false, true]);

    await categories.setCategoryHidden.run(callAs('ana', { categoryId: 'hombre', hidden: false }));
    expect(own()).toEqual([false, false, true]);
    expect(tree()).toEqual(before);
  });

  it.each(NAMES)('%s: un miembro sin catalog.write recibe permission-denied y queda el evento', async (name) => {
    addReader(h);
    const code = await httpsErrorCode(categories[name].run(callAs('lector', { categoryId: 'ropa', productIds: ['p1'] })));
    expect(code).toBe('permission-denied');
    expect(h.securityEvents.events).toEqual([expect.objectContaining({ kind: 'permission-denied', actorUid: 'lector' })]);
  });

  // SC-004: una cuenta que no es del comercio no opera sobre él aunque mande su id.
  it.each(NAMES)('%s: con el tenantId de otro comercio, permission-denied y evento cross-tenant-access', async (name) => {
    const code = await httpsErrorCode(categories[name].run(callRequest({ auth: { uid: 'ana' }, data: { tenantId: 't2', categoryId: 'ropa' } })));
    expect(code).toBe('permission-denied');
    expect(h.securityEvents.events).toEqual([expect.objectContaining({ kind: 'cross-tenant-access' })]);
  });

  it('un cuarto nivel viaja en la envoltura con su motivo', async () => {
    await create('ropa', null, 'Ropa');
    await create('hombre', 'ropa', 'Hombre');
    await create('camisetas', 'hombre', 'Camisetas');
    await expect(create('x', 'camisetas', 'Manga corta')).resolves.toEqual(
      expect.objectContaining({ ok: false, code: 'category-limit', details: { reason: 'depth' } }),
    );
  });

  it('la entrada se valida después de autorizar: una lista que no es de textos es inválida', async () => {
    const result = await categories.setProductCategories.run(callAs('ana', { productId: 'p1', add: 'ropa', remove: [] }));
    expect(result).toEqual(expect.objectContaining({ ok: false, code: 'invalid-argument' }));
  });

  it('el editor manda lo que agrega y lo que quita: un conjunto completo no se acepta', async () => {
    const result = await categories.setProductCategories.run(callAs('ana', { productId: 'p1', categoryIds: ['ropa'] }));
    expect(result).toEqual(expect.objectContaining({ ok: false, code: 'invalid-argument' }));
  });

  describe('poda después de confirmar', () => {
    beforeEach(async () => {
      await create('ropa', null, 'Ropa');
      await create('verano', null, 'Verano');
      await categories.assignCategory.run(callAs('ana', { categoryId: 'verano', productIds: ['p1'] }));
      await categories.assignCategory.run(callAs('ana', { categoryId: 'ropa', productIds: ['p1'] }));
    });

    it('eliminar una categoría la poda de sus productos y vacía las pendientes', async () => {
      const before = product();
      await expect(categories.deleteCategory.run(callAs('ana', { categoryId: 'verano' }))).resolves.toEqual(expect.objectContaining({ ok: true }));
      expect(product()).toEqual({ ...before, categoryIds: ['ropa'] });
      expect(tree().pendingPrune).toEqual([]);
    });

    it('si la poda falla, la eliminación igual queda confirmada; la próxima operación del árbol la termina', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const failing = { prune: vi.fn().mockRejectedValue(new Error('se cortó')) };
      const broken = categoryCallables({ ...h.deps, prunerFor: () => failing });

      await expect(broken.deleteCategory.run(callAs('ana', { categoryId: 'verano' }))).resolves.toEqual(expect.objectContaining({ ok: true }));
      expect(tree().nodes[categoryId('verano')]).toBeUndefined();
      expect(tree().pendingPrune).toEqual(['verano']);
      expect(product()?.categoryIds).toEqual(['verano', 'ropa']);

      await categories.renameCategory.run(callAs('ana', { categoryId: 'ropa', name: 'Indumentaria' }));
      expect(tree().pendingPrune).toEqual([]);
      expect(product()?.categoryIds).toEqual(['ropa']);
    });

    it.each(['createCategory', 'renameCategory', 'setCategorySlug', 'moveCategory', 'setCategoryHidden', 'deleteCategory'] as const)(
      '%s termina una poda que quedó cortada',
      async (name) => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const broken = categoryCallables({ ...h.deps, prunerFor: () => ({ prune: vi.fn().mockRejectedValue(new Error('se cortó')) }) });
        await broken.createCategory.run(callAs('ana', { requestId: 'otra', parentId: null, name: 'Otra' }));
        await broken.deleteCategory.run(callAs('ana', { categoryId: 'verano' }));
        expect([tree().pendingPrune, product()?.categoryIds]).toEqual([['verano'], ['verano', 'ropa']]);

        const input = {
          createCategory: { requestId: 'nueva', parentId: null, name: 'Nueva' },
          renameCategory: { categoryId: 'ropa', name: 'Indumentaria' },
          setCategorySlug: { categoryId: 'ropa', slug: 'indumentaria' },
          moveCategory: { categoryId: 'ropa', parentId: null, position: 1 },
          setCategoryHidden: { categoryId: 'ropa', hidden: true },
          deleteCategory: { categoryId: 'otra' },
        }[name];
        await expect(categories[name].run(callAs('ana', input))).resolves.toEqual(expect.objectContaining({ ok: true }));
        expect([tree().pendingPrune, product()?.categoryIds]).toEqual([[], ['ropa']]);
      },
    );

    it('una operación del árbol que falla no poda: no confirmó nada', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const broken = categoryCallables({ ...h.deps, prunerFor: () => ({ prune: vi.fn().mockRejectedValue(new Error('se cortó')) }) });
      await broken.deleteCategory.run(callAs('ana', { categoryId: 'verano' }));
      const failed = await categories.renameCategory.run(callAs('ana', { categoryId: 'nada', name: 'X' }));
      expect(failed).toEqual(expect.objectContaining({ ok: false, code: 'not-found' }));
      expect(tree().pendingPrune).toEqual(['verano']);
    });
  });
});

/** Un miembro activo, `lector`, con un rol que solo lee el catálogo. */
function addReader(h: Harness): void {
  const role = { ...createCustomRole(roleId('lector'), T1, 'Lector', AT), permissions: ['catalog.read' as const] };
  h.t1.store.roles.set(role.id, role);
  const reader = member('lector', 'lector');
  h.t1.store.members.set(reader.uid, reader);
}

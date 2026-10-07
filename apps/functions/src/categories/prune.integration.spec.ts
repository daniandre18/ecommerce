import { categoryId, createOwnerRole, normalizeName, productId, resolveCategories, storefrontDefaults, type CategoryId, type Product } from '@ecommerce/domain';
import { firestore, FirestoreCategoryPruner, FirestoreUnitOfWork } from '@ecommerce/infrastructure';
import { clearFirestoreEmulator } from '@ecommerce/infrastructure/testing';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { productionDependencies } from '../bootstrap/composition';
import { AT, callAs, member, T1 } from '../testing/harness';
import { categoryCallables } from './callables';

const db = firestore();
const PRODUCTS = 1200;
const cid = (value: string): CategoryId => categoryId(value);

const product = (n: number): Product => ({
  ...storefrontDefaults(),
  id: productId(`p${String(n).padStart(4, '0')}`),
  tenantId: T1,
  name: `Producto ${n}`,
  nameNormalized: normalizeName(`Producto ${n}`),
  description: '',
  images: [],
  options: [],
  status: 'draft',
  archived: n % 10 === 0,
  variantCount: 1,
  hasIncompleteVariants: true,
  createdAt: AT,
  updatedAt: new Date(AT.getTime() + n * 1000),
  version: 1 + (n % 3),
  // Todos en Verano; la mitad, además, en Ropa.
  categoryIds: n % 2 === 0 ? [cid('verano'), cid('ropa')] : [cid('verano')],
});

/** Cada producto con su versión, su fecha de edición y sus categorías, para comparar antes y después. */
async function snapshot() {
  const docs = (await db.collection('tenants/t1/products').get()).docs;
  return new Map(
    docs.map((d) => [d.id, { version: d.get('version') as number, updatedAt: d.get('updatedAt').toMillis() as number, categoryIds: d.get('categoryIds') as string[] }]),
  );
}

const tree = () => new FirestoreUnitOfWork(db, T1).run((tx) => tx.categories.get());
const withCategory = async (id: string) => (await db.collection('tenants/t1/products').where('categoryIds', 'array-contains', id).count().get()).data().count;

// T050 — Historia 2, research §2: eliminar una categoría saca el nodo del árbol en su transacción y
// poda sus ids de los productos DESPUÉS, en lotes. Una poda cortada a la mitad deja el catálogo
// correcto a la lectura, y la siguiente operación del árbol la termina. Contra el emulador.
describe('poda convergente de una categoría eliminada', () => {
  let before: Awaited<ReturnType<typeof snapshot>>;

  beforeAll(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await clearFirestoreEmulator();
    await db.doc('tenants/t1').set({ name: 'Uno', ownerUid: 'owner', currency: 'USD', createdAt: AT, createdBy: 'seed', status: 'active' });
    await new FirestoreUnitOfWork(db, T1).run(async (tx) => {
      await tx.roles.save(createOwnerRole(T1, AT));
      await tx.members.save(member('owner', 'owner', true));
    });
    const categories = categoryCallables(productionDependencies());
    for (const [key, name] of [['verano', 'Verano'], ['ropa', 'Ropa']]) {
      const created = await categories.createCategory.run(callAs('owner', { requestId: key, parentId: null, name }));
      if (!created.ok) throw new Error(JSON.stringify(created));
    }
    for (let start = 0; start < PRODUCTS; start += 400) {
      await new FirestoreUnitOfWork(db, T1).run(async (tx) => {
        for (let n = start; n < Math.min(start + 400, PRODUCTS); n++) await tx.products.save(product(n));
      });
    }
    before = await snapshot();
  }, 60_000);

  it(`eliminar con la poda cortada después del primer lote: la eliminación queda, la poda a medias`, async () => {
    const cut = categoryCallables({ ...productionDependencies(), prunerFor: (tenant) => new FirestoreCategoryPruner(db, tenant, { failAfterBatches: 1 }) });
    await expect(cut.deleteCategory.run(callAs('owner', { categoryId: 'verano' }))).resolves.toEqual(expect.objectContaining({ ok: true }));

    expect((await tree()).nodes[cid('verano')]).toBeUndefined();
    // Un lote de 500 se podó; el resto sigue con el id.
    expect(await withCategory('verano')).toBe(PRODUCTS - 500);
  });

  it('(a) leídos contra el árbol, ningún producto muestra la categoría eliminada', async () => {
    const current = await tree();
    const docs = (await db.collection('tenants/t1/products').get()).docs;
    const shown = docs.flatMap((d) => resolveCategories(current, d.get('categoryIds') as CategoryId[]));
    expect(shown).not.toContain('verano');
    expect(shown.filter((id) => id === 'ropa')).toHaveLength(PRODUCTS / 2);
  });

  it('(b) el filtro por otra categoría da lo correcto', async () => {
    expect(await withCategory('ropa')).toBe(PRODUCTS / 2);
  });

  it('(c) el id sigue pendiente de podar', async () => {
    expect((await tree()).pendingPrune).toEqual(['verano']);
  });

  it('(d) la poda no cambió la versión ni la fecha de edición de ningún producto', async () => {
    const after = await snapshot();
    for (const [id, was] of before) {
      expect({ id, version: after.get(id)?.version, updatedAt: after.get(id)?.updatedAt }).toEqual({ id, version: was.version, updatedAt: was.updatedAt });
    }
  });

  it('cualquier otra operación del árbol la termina y vacía las pendientes, sin tocar nada más', async () => {
    const categories = categoryCallables(productionDependencies());
    await expect(categories.renameCategory.run(callAs('owner', { categoryId: 'ropa', name: 'Indumentaria' }))).resolves.toEqual(
      expect.objectContaining({ ok: true }),
    );
    expect(await withCategory('verano')).toBe(0);
    expect((await tree()).pendingPrune).toEqual([]);

    const after = await snapshot();
    for (const [id, was] of before) {
      expect(after.get(id)).toEqual({ ...was, categoryIds: was.categoryIds.filter((c) => c !== 'verano') });
    }
  }, 60_000);

  it('correrla otra vez no cambia nada', async () => {
    const pruned = await snapshot();
    const categories = categoryCallables(productionDependencies());
    await categories.renameCategory.run(callAs('owner', { categoryId: 'ropa', name: 'Ropa' }));
    expect(await snapshot()).toEqual(pruned);
    expect((await tree()).pendingPrune).toEqual([]);
  });
});

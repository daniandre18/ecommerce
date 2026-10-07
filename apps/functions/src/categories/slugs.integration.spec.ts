import { createOwnerRole } from '@ecommerce/domain';
import { firestore, FirestoreUnitOfWork } from '@ecommerce/infrastructure';
import { clearFirestoreEmulator } from '@ecommerce/infrastructure/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { productionDependencies } from '../bootstrap/composition';
import { AT, callAs, member, T1 } from '../testing/harness';
import { categoryCallables } from './callables';

const db = firestore();
const callables = () => categoryCallables(productionDependencies());
const treeDoc = async () => (await db.doc('tenants/t1/storefront/categoryTree').get()).data() ?? {};
/** Lo que ocupa el árbol, sin la marca de tiempo de la última escritura. */
const treeSize = async () => JSON.stringify((await treeDoc())['nodes']).length;
const reservations = async () => Object.fromEntries((await db.collection('tenants/t1/categorySlugs').get()).docs.map((d) => [d.id, d.get('categoryId')]));

const create = async (id: string, name: string, slug?: string) => {
  const result = await callables().createCategory.run(callAs('owner', { requestId: id, parentId: null, name, ...(slug ? { slug } : {}) }));
  if (!result.ok) throw new Error(JSON.stringify(result));
};
const setSlug = (id: string, slug: string) => callables().setCategorySlug.run(callAs('owner', { categoryId: id, slug }));

// T110 — las URL anteriores de las categorías viven fuera del árbol, una por documento en
// `categorySlugs`: el árbol tiene un límite duro de 1 MiB y cada cambio de URL lo agrandaba sin tope.
describe('URL anteriores de categoría, fuera del árbol', () => {
  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await clearFirestoreEmulator();
    await db.doc('tenants/t1').set({ name: 'Uno', ownerUid: 'owner', currency: 'USD', createdAt: AT, createdBy: 'seed', status: 'active' });
    await new FirestoreUnitOfWork(db, T1).run(async (tx) => {
      await tx.roles.save(createOwnerRole(T1, AT));
      await tx.members.save(member('owner', 'owner', true));
    });
  });

  it('200 cambios de URL no agrandan el documento del árbol; cada anterior queda reservada en su entrada', async () => {
    // Todas de 7 caracteres: si el tamaño cambia, es que el árbol creció.
    await create('hombre', 'Hombre', 'url-ini');
    const before = await treeSize();
    for (let i = 0; i < 200; i++) {
      const result = await setSlug('hombre', `url-${String(i).padStart(3, '0')}`);
      expect(result.ok).toBe(true);
    }
    expect(await treeSize()).toBe(before);
    const tree = await treeDoc();
    expect((tree['nodes'] as Record<string, Record<string, unknown>>)['hombre']).not.toHaveProperty('previousSlugs');
    const reserved = await reservations();
    expect(Object.keys(reserved)).toHaveLength(200);
    expect(reserved['url-ini']).toBe('hombre');
    expect(reserved['url-198']).toBe('hombre');
    expect(reserved['url-199']).toBeUndefined();
  }, 120_000);

  it('una anterior de otra categoría que existe no se toma; de una eliminada, sí', async () => {
    await create('hombre', 'Hombre');
    await create('mujer', 'Mujer');
    await setSlug('hombre', 'caballeros');
    await expect(setSlug('mujer', 'hombre')).resolves.toEqual(expect.objectContaining({ ok: false, code: 'slug-conflict' }));

    await callables().deleteCategory.run(callAs('owner', { categoryId: 'hombre' }));
    await expect(setSlug('mujer', 'hombre')).resolves.toEqual(expect.objectContaining({ ok: true }));
    expect(await reservations()).toEqual({ mujer: 'mujer' });
  });

  it('dos categorías piden la misma URL libre a la vez: una la obtiene, la otra recibe slug-conflict', async () => {
    await create('hombre', 'Hombre');
    await create('mujer', 'Mujer');
    const results = await Promise.all([setSlug('hombre', 'compartida'), setSlug('mujer', 'compartida')]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([expect.objectContaining({ code: 'slug-conflict' })]);
  });
});

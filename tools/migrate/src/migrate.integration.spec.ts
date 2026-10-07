import { firestore } from '@ecommerce/infrastructure';
import { clearFirestoreEmulator } from '@ecommerce/infrastructure/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { migrateStorefront } from './migrate';

const db = firestore();
const AT = new Date('2026-09-30T12:00:00Z');

/** Un producto tal como lo guardaba la 001: ninguno de los campos de la 002. */
const legacy = (name: string, status: string) => ({
  name,
  nameNormalized: name.toLowerCase(),
  description: '',
  images: [],
  options: [],
  status,
  archived: false,
  variantCount: 1,
  hasIncompleteVariants: false,
  createdAt: AT,
  updatedAt: AT,
  version: 3,
});

const product = async (tenant: string, id: string) => (await db.doc(`tenants/${tenant}/products/${id}`).get()).data() ?? {};
const index = async (tenant: string) =>
  Object.fromEntries((await db.collection(`tenants/${tenant}/slugIndex`).get()).docs.map((d) => [d.id, d.get('productId') as string]));

// T042 — la migración de los productos anteriores a la 002, contra el emulador.
describe('migración de la ficha de tienda', () => {
  let first: Awaited<ReturnType<typeof migrateStorefront>>;
  let second: Awaited<ReturnType<typeof migrateStorefront>>;
  let afterFirst: Record<string, unknown>;

  beforeAll(async () => {
    await clearFirestoreEmulator();
    for (const tenant of ['t1', 't2']) await db.doc(`tenants/${tenant}`).set({ name: tenant, currency: 'COP', status: 'active' });
    await db.doc('tenants/t1/products/a').set(legacy('Camiseta', 'active'));
    await db.doc('tenants/t1/products/b').set(legacy('Camiseta', 'draft'));
    await db.doc('tenants/t1/products/Qm9c8Zk1xyz').set(legacy('★★★', 'draft'));
    await db.doc('tenants/t2/products/a').set(legacy('Camiseta', 'unlisted'));

    first = await migrateStorefront();
    afterFirst = await product('t1', 'a');
    second = await migrateStorefront();
  });

  it('asigna URL a cada producto, con el sufijo ante un nombre repetido en el mismo comercio', async () => {
    expect([(await product('t1', 'a'))['slug'], (await product('t1', 'b'))['slug']].sort()).toEqual(['camiseta', 'camiseta-2']);
    expect(await index('t1')).toEqual(expect.objectContaining({ camiseta: expect.any(String), 'camiseta-2': expect.any(String) }));
  });

  it('cada comercio tiene su propio espacio de URL', async () => {
    expect((await product('t2', 'a'))['slug']).toBe('camiseta');
    expect(await index('t2')).toEqual({ camiseta: 'a' });
  });

  it('un nombre sin letras ni números recibe la de respaldo, marcada para reemplazar', async () => {
    expect(await product('t1', 'Qm9c8Zk1xyz')).toEqual(expect.objectContaining({ slug: 'producto-qm9c8zk1', slugNeedsReplacement: true }));
  });

  it('materializa los valores por defecto de la ficha, y los publicados quedan con la URL fija', async () => {
    expect(await product('t1', 'a')).toEqual(
      expect.objectContaining({ kind: 'physical', priceVisible: true, freeShipping: false, publishedOnce: true, slugLocked: true }),
    );
    expect(await product('t1', 'b')).toEqual(expect.objectContaining({ publishedOnce: false, slugLocked: false }));
  });

  it('no cambia el estado ni la versión de ningún producto', async () => {
    expect(await product('t1', 'a')).toEqual(expect.objectContaining({ status: 'active', version: 3 }));
    expect(await product('t2', 'a')).toEqual(expect.objectContaining({ status: 'unlisted', version: 3 }));
  });

  it('es idempotente: la segunda corrida no migra nada ni cambia nada', async () => {
    expect(first).toEqual({ migrated: 4, already: 0 });
    expect(second).toEqual({ migrated: 0, already: 4 });
    expect(await product('t1', 'a')).toEqual(afterFirst);
  });

  // Salvaguarda: la migración SÍ corre en producción —para eso existe—, pero no por accidente.
  it('contra un proyecto real exige confirmarlo por su nombre, y no toca nada si no coincide', async () => {
    await expect(migrateStorefront({ project: 'ecommerce-prod' })).rejects.toThrow(/--confirm ecommerce-prod/);
    await expect(migrateStorefront({ project: 'ecommerce-prod', confirm: 'otro' })).rejects.toThrow(/--confirm ecommerce-prod/);
  });
});

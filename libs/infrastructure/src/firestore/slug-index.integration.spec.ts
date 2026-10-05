import { productId, slug, storefrontDefaults, tenantId, type Product } from '@ecommerce/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearFirestoreEmulator } from '../testing/emulator';
import { firestore } from './firestore';
import { FirestoreUnitOfWork } from './unit-of-work';

const db = firestore();
const T1 = tenantId('t1');
const AT = new Date('2026-10-05T12:00:00Z');
const CAMISETA = slug('camiseta');

const product = (id: string): Product => ({
  ...storefrontDefaults(),
  id: productId(id),
  tenantId: T1,
  name: 'Camiseta',
  nameNormalized: 'camiseta',
  description: '',
  images: [],
  options: [],
  status: 'draft',
  archived: false,
  variantCount: 1,
  hasIncompleteVariants: true,
  createdAt: AT,
  updatedAt: AT,
  version: 1,
  slug: CAMISETA,
});

const entry = async (value: string) => (await db.doc(`tenants/t1/slugIndex/${value}`).get()).data();
const productExists = async (id: string) => (await db.doc(`tenants/t1/products/${id}`).get()).exists;

/** El producto y la reserva de su URL, en la misma transacción: lo que hace `CreateProduct`. */
const createWithSlug = (uow: FirestoreUnitOfWork, id: string) =>
  uow.run(async (tx) => {
    await tx.products.save(product(id));
    await tx.slugIndex.reserve(CAMISETA, productId(id));
  });

// T024 — SC-001: la reserva de una URL es atómica. La prueba que importa es la concurrente.
describe('slugIndex contra el emulador', () => {
  const uow = new FirestoreUnitOfWork(db, T1);

  beforeEach(async () => {
    await clearFirestoreEmulator();
  });

  it('dos transacciones reservan la misma URL a la vez: una confirma, la otra falla sin dejar nada', async () => {
    const results = await Promise.allSettled([createWithSlug(uow, 'p1'), createWithSlug(uow, 'p2')]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);

    const winner = results[0]?.status === 'fulfilled' ? 'p1' : 'p2';
    const loser = winner === 'p1' ? 'p2' : 'p1';
    expect(await entry('camiseta')).toEqual(expect.objectContaining({ productId: winner, kind: 'current' }));
    // Atómica: el producto que acompañaba a la reserva fallida tampoco quedó.
    expect(await productExists(winner)).toBe(true);
    expect(await productExists(loser)).toBe(false);
  });

  it('una URL anterior sigue reservada: otro producto no puede tomarla', async () => {
    await createWithSlug(uow, 'p1');
    await uow.run(async (tx) => tx.slugIndex.markPrevious(CAMISETA));
    expect(await entry('camiseta')).toEqual(expect.objectContaining({ productId: 'p1', kind: 'previous' }));

    await expect(createWithSlug(uow, 'p2')).rejects.toThrow();
    expect(await productExists('p2')).toBe(false);
  });

  it('find la devuelve con su dueño y su tipo; markCurrent la recupera como vigente', async () => {
    await createWithSlug(uow, 'p1');
    await uow.run(async (tx) => tx.slugIndex.markPrevious(CAMISETA));
    await uow.run(async (tx) => tx.slugIndex.markCurrent(CAMISETA));
    const found = await uow.run(async (tx) => tx.slugIndex.find(CAMISETA));
    expect(found).toEqual({ productId: 'p1', kind: 'current' });
  });

  it('release la libera: otro producto puede tomarla', async () => {
    await createWithSlug(uow, 'p1');
    await uow.run(async (tx) => tx.slugIndex.release(CAMISETA));
    await createWithSlug(uow, 'p2');
    expect(await entry('camiseta')).toEqual(expect.objectContaining({ productId: 'p2' }));
  });

  it('una URL libre no tiene entrada', async () => {
    await expect(uow.run(async (tx) => tx.slugIndex.find(CAMISETA))).resolves.toBeNull();
  });
});

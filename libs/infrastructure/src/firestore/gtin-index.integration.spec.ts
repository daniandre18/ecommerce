import { createIncompleteVariant, gtin, productId, tenantId, variantId, type Variant } from '@ecommerce/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearFirestoreEmulator } from '../testing/emulator';
import { firestore } from './firestore';
import { FirestoreUnitOfWork } from './unit-of-work';

const db = firestore();
const T1 = tenantId('t1');
const P1 = productId('p1');
const EAN = gtin('4006381333931');

const variant = (id: string, overrides: Partial<Variant> = {}): Variant => ({
  ...createIncompleteVariant({ id: variantId(id), tenantId: T1, productId: P1, optionValues: {} }),
  version: 1,
  ...overrides,
});
const entry = async (normalized: string) => (await db.doc(`tenants/t1/gtinIndex/${normalized}`).get()).data();
const variantDoc = async (id: string) => (await db.doc(`tenants/t1/products/p1/variants/${id}`).get()).data();

/** Una barrera para `n`: cada uno espera a que lleguen todos, así las transacciones se solapan. */
function barrier(n: number) {
  let arrived = 0;
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return async () => {
    if (arrived >= n) return;
    arrived++;
    if (arrived === n) open();
    await opened;
  };
}

// T084 — Historia 4, FR-030 contra el emulador: el GTIN se reserva como el SKU, con `tx.create`.
describe('reserva de GTIN', () => {
  const uow = new FirestoreUnitOfWork(db, T1);

  beforeEach(async () => {
    await clearFirestoreEmulator();
  });

  it('la reserva se guarda con el GTIN normalizado como id, y se encuentra', async () => {
    await uow.run((tx) => tx.gtinIndex.reserve({ gtin: EAN, productId: P1, variantId: variantId('v1') }));
    expect(await entry('04006381333931')).toEqual(expect.objectContaining({ gtin: '4006381333931', productId: 'p1', variantId: 'v1' }));
    await expect(uow.run((tx) => tx.gtinIndex.find(EAN))).resolves.toEqual({ gtin: EAN, productId: 'p1', variantId: 'v1' });
  });

  it('dos transacciones reservan el mismo GTIN a la vez: solo una confirma, y la otra no deja nada', async () => {
    const wait = barrier(2);
    const reserve = (id: string) =>
      uow.run(async (tx) => {
        await wait();
        // La otra escritura de la misma transacción: si la reserva falla, tampoco queda.
        await tx.variants.save(variant(id, { gtin: EAN }));
        await tx.gtinIndex.reserve({ gtin: EAN, productId: P1, variantId: variantId(id) });
      });
    const results = await Promise.allSettled([reserve('v1'), reserve('v2')]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const winner = results[0]?.status === 'fulfilled' ? 'v1' : 'v2';
    const loser = winner === 'v1' ? 'v2' : 'v1';
    expect((await entry('04006381333931'))?.['variantId']).toBe(winner);
    expect(await variantDoc(loser)).toBeUndefined();
  });

  it('un EAN-13 y el mismo con un cero delante son el mismo código: chocan', async () => {
    await uow.run((tx) => tx.gtinIndex.reserve({ gtin: gtin('4006381333931'), productId: P1, variantId: variantId('v1') }));
    await expect(uow.run((tx) => tx.gtinIndex.reserve({ gtin: gtin('04006381333931'), productId: P1, variantId: variantId('v2') }))).rejects.toThrow();
    expect((await entry('04006381333931'))?.['variantId']).toBe('v1');
  });

  it('archivar la variante NO libera su GTIN: sigue reservado, y otra no puede tomarlo', async () => {
    await uow.run(async (tx) => {
      await tx.variants.save(variant('v1', { gtin: EAN }));
      await tx.gtinIndex.reserve({ gtin: EAN, productId: P1, variantId: variantId('v1') });
    });
    await uow.run((tx) => tx.variants.save(variant('v1', { gtin: EAN, archived: true, version: 2 })));

    await expect(uow.run((tx) => tx.gtinIndex.find(EAN))).resolves.toEqual(expect.objectContaining({ variantId: 'v1' }));
    await expect(uow.run((tx) => tx.gtinIndex.reserve({ gtin: EAN, productId: P1, variantId: variantId('v2') }))).rejects.toThrow();
  });

  it('release lo libera, y otra variante puede tomarlo', async () => {
    await uow.run((tx) => tx.gtinIndex.reserve({ gtin: EAN, productId: P1, variantId: variantId('v1') }));
    await uow.run((tx) => tx.gtinIndex.release(EAN));
    await expect(uow.run((tx) => tx.gtinIndex.find(EAN))).resolves.toBeNull();
    await uow.run((tx) => tx.gtinIndex.reserve({ gtin: EAN, productId: P1, variantId: variantId('v2') }));
    expect((await entry('04006381333931'))?.['variantId']).toBe('v2');
  });
});

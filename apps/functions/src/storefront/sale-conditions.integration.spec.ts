import type { TransactionScope, UnitOfWork } from '@ecommerce/application';
import { createOwnerRole, productId } from '@ecommerce/domain';
import { firestore, FirestoreUnitOfWork } from '@ecommerce/infrastructure';
import { clearFirestoreEmulator } from '@ecommerce/infrastructure/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallableDependencies } from '../bootstrap/callable';
import { productionDependencies } from '../bootstrap/composition';
import { catalogCallables } from '../catalog/callables';
import { AT, callAs, member, T1 } from '../testing/harness';
import { storefrontCallables } from './callables';

const db = firestore();
const IDS = Array.from({ length: 20 }, (_, i) => `p${String(i).padStart(2, '0')}`);

/** Las dependencias de producción, con cada transacción vista a través de `decorate`. */
function decorated(decorate: (tx: TransactionScope) => TransactionScope): CallableDependencies {
  const real = productionDependencies();
  return {
    ...real,
    unitOfWorkFor: (tenant): UnitOfWork => {
      const uow = real.unitOfWorkFor(tenant);
      return { run: (work) => uow.run((tx) => work(decorate(tx))) };
    },
  };
}

const products = async () => (await db.collection('tenants/t1/products').get()).docs;
const auditEntries = async () => (await db.collection('tenants/t1/auditLog').get()).docs;
const freeShipping = async (deps: CallableDependencies, ids = IDS) => {
  const docs = await products();
  const changes = ids.map((id) => ({ productId: id, version: docs.find((d) => d.id === id)?.get('version') as number }));
  return storefrontCallables(deps).setSaleConditions.run(callAs('owner', { changes, freeShipping: true }));
};

// T066 — Historia 3, FR-032 y FR-029 a nivel de callable, contra Firestore: el cambio de las
// condiciones de venta y sus entradas se confirman juntos o no se confirma ninguno, también en lote.
describe('atomicidad de setSaleConditions con su bitácora', () => {
  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await clearFirestoreEmulator();
    await db.doc('tenants/t1').set({ name: 'Uno', ownerUid: 'owner', currency: 'USD', createdAt: AT, createdBy: 'seed', status: 'active' });
    await new FirestoreUnitOfWork(db, T1).run(async (tx) => {
      await tx.roles.save(createOwnerRole(T1, AT));
      await tx.members.save(member('owner', 'owner', true));
    });
    const { createProduct } = catalogCallables(productionDependencies());
    for (const id of IDS) {
      const created = await createProduct.run(callAs('owner', { requestId: id, name: `Producto ${id}`, description: '' }));
      if (!created.ok) throw new Error(JSON.stringify(created));
    }
  }, 30_000);

  it('sin fallas, los 20 cambian y quedan 20 entradas con un batchId común', async () => {
    const result = await freeShipping(productionDependencies());
    expect(result).toEqual(expect.objectContaining({ ok: true, data: expect.objectContaining({ updated: 20 }) }));
    expect((await products()).every((d) => d.get('freeShipping') === true)).toBe(true);
    const entries = await auditEntries();
    expect(entries).toHaveLength(20);
    expect(new Set(entries.map((e) => e.get('batchId'))).size).toBe(1);
  });

  it('sentido 1: si UNA de las 20 entradas no puede crearse, ningún producto cambia', async () => {
    await storefrontCallables(productionDependencies()).setSaleConditions.run(
      callAs('owner', { changes: [{ productId: 'p00', version: 1 }], priceVisible: false }),
    );
    const [taken] = await auditEntries();
    const before = (await products()).map((d) => [d.id, d.get('freeShipping'), d.get('version')]);
    // La última entrada del lote reutiliza el id de una existente: `create` falla al confirmar.
    const colliding = decorated((tx) => ({
      ...tx,
      audit: { append: (entries) => tx.audit.append(entries.map((entry, i) => (i === entries.length - 1 ? { ...entry, id: taken?.id as typeof entry.id } : entry))) },
    }));

    await expect(freeShipping(colliding)).resolves.toEqual(expect.objectContaining({ ok: false, code: 'audit-write-failed' }));
    expect((await products()).map((d) => [d.id, d.get('freeShipping'), d.get('version')])).toEqual(before);
    expect(await auditEntries()).toHaveLength(1);
  });

  it('sentido 2: si la escritura de los productos falla al confirmar, no queda ninguna entrada', async () => {
    const failingChange = decorated((tx) => ({
      ...tx,
      products: {
        ...tx.products,
        save: async (product) => {
          await tx.products.save(product);
          await tx.products.updateVariantSummary(productId('no-existe'), { variantCount: 0, hasIncompleteVariants: false, missingShippingData: false });
        },
      },
    }));

    await expect(freeShipping(failingChange, ['p00', 'p01'])).resolves.toEqual(expect.objectContaining({ ok: false, code: 'audit-write-failed' }));
    expect((await products()).some((d) => d.get('freeShipping') === true)).toBe(false);
    expect(await auditEntries()).toHaveLength(0);
  });
});

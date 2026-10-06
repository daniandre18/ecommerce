import type { TransactionScope, UnitOfWork } from '@ecommerce/application';
import { createOwnerRole, productId } from '@ecommerce/domain';
import { firestore, FirestoreUnitOfWork } from '@ecommerce/infrastructure';
import { clearFirestoreEmulator } from '@ecommerce/infrastructure/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallableDependencies } from '../bootstrap/callable';
import { productionDependencies } from '../bootstrap/composition';
import { AT, callAs, member, T1 } from '../testing/harness';
import { catalogCallables } from './callables';

const db = firestore();

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

/** Una escritura más, a un documento que no existe: la confirmación entera falla. */
const failCommit = (tx: TransactionScope) => tx.products.updateVariantSummary(productId('no-existe'), { variantCount: 0, hasIncompleteVariants: false });

const archived = async () => (await db.doc('tenants/t1/products/p1').get()).get('archived') as boolean;
const sections = async () => (await db.doc('tenants/t1/storefront/sections').get()).data();
const archive = (deps: CallableDependencies) => catalogCallables(deps).archiveProduct.run(callAs('owner', { productId: 'p1', version: 1 }));

// T069 — Historia 3, FR-028 contra el emulador: archivar y salir de las secciones se confirman juntos.
describe('atomicidad del archivado con las secciones', () => {
  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await clearFirestoreEmulator();
    await db.doc('tenants/t1').set({ name: 'Uno', ownerUid: 'owner', currency: 'USD', createdAt: AT, createdBy: 'seed', status: 'active' });
    await new FirestoreUnitOfWork(db, T1).run(async (tx) => {
      await tx.roles.save(createOwnerRole(T1, AT));
      await tx.members.save(member('owner', 'owner', true));
      await tx.sections.save({ featured: [productId('otro'), productId('p1')], offers: [productId('p1')] });
    });
    const created = await catalogCallables(productionDependencies()).createProduct.run(callAs('owner', { requestId: 'p1', name: 'Camiseta', description: '' }));
    if (!created.ok) throw new Error(JSON.stringify(created));
  });

  it('sin fallas, queda archivado y fuera de las dos secciones', async () => {
    await expect(archive(productionDependencies())).resolves.toEqual(expect.objectContaining({ ok: true }));
    expect(await archived()).toBe(true);
    expect(await sections()).toEqual(expect.objectContaining({ featured: ['otro'], offers: [] }));
  });

  it('si falla guardar las secciones, el producto no queda archivado', async () => {
    const failing = decorated((tx) => ({
      ...tx,
      sections: {
        ...tx.sections,
        save: async (value) => {
          await tx.sections.save(value);
          await failCommit(tx);
        },
      },
    }));
    await expect(archive(failing)).rejects.toThrow();
    expect(await archived()).toBe(false);
    expect(await sections()).toEqual(expect.objectContaining({ featured: ['otro', 'p1'], offers: ['p1'] }));
  });

  it('si falla guardar el producto, las secciones no cambian', async () => {
    const failing = decorated((tx) => ({
      ...tx,
      products: {
        ...tx.products,
        save: async (product) => {
          await tx.products.save(product);
          await failCommit(tx);
        },
      },
    }));
    await expect(archive(failing)).rejects.toThrow();
    expect(await archived()).toBe(false);
    expect(await sections()).toEqual(expect.objectContaining({ featured: ['otro', 'p1'], offers: ['p1'] }));
  });
});

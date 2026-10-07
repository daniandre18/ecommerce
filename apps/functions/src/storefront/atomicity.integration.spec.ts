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

// T025 — FR-032 y FR-033 a nivel de callable, contra Firestore, como T038 de la 001: el cambio de tipo
// y su entrada de bitácora se confirman juntos o no se confirma ninguno. Las fallas son de Firestore
// al confirmar, no excepciones lanzadas antes.
describe('atomicidad de la bitácora en setProductType', () => {
  const productDoc = () => db.doc('tenants/t1/products/p1').get();
  const auditEntries = async () => (await db.collection('tenants/t1/auditLog').get()).docs;
  const setType = async (deps: CallableDependencies, kind: string) => {
    const version = (await productDoc()).get('version') as number;
    return storefrontCallables(deps).setProductType.run(callAs('owner', { productId: 'p1', version, kind }));
  };

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await clearFirestoreEmulator();
    await db.doc('tenants/t1').set({ name: 'Uno', ownerUid: 'owner', currency: 'USD', createdAt: AT, createdBy: 'seed', status: 'active' });
    await new FirestoreUnitOfWork(db, T1).run(async (tx) => {
      await tx.roles.save(createOwnerRole(T1, AT));
      await tx.members.save(member('owner', 'owner', true));
    });
    const created = await catalogCallables(productionDependencies()).createProduct.run(
      callAs('owner', { requestId: 'p1', name: 'Camiseta', description: '' }),
    );
    if (!created.ok) throw new Error(`No se pudo crear el producto: ${JSON.stringify(created)}`);
  });

  it('sin fallas, el tipo y su entrada quedan juntos', async () => {
    await expect(setType(productionDependencies(), 'digital')).resolves.toEqual(expect.objectContaining({ ok: true }));
    expect((await productDoc()).get('kind')).toBe('digital');
    const [entry] = await auditEntries();
    expect(entry?.data()).toEqual(expect.objectContaining({ type: 'sale-conditions.changed', field: 'shipping', before: 'charged', after: 'none' }));
  });

  it('sentido 1: si la entrada no puede crearse, el tipo no cambia', async () => {
    await setType(productionDependencies(), 'digital');
    const [taken] = await auditEntries();
    // La entrada nueva reutiliza el id de una existente: `create` falla al confirmar.
    const colliding = decorated((tx) => ({
      ...tx,
      audit: { append: (entries) => tx.audit.append(entries.map((entry) => ({ ...entry, id: taken?.id as typeof entry.id }))) },
    }));

    await expect(setType(colliding, 'physical')).resolves.toEqual(expect.objectContaining({ ok: false, code: 'audit-write-failed' }));
    expect((await productDoc()).get('kind')).toBe('digital');
    expect(await auditEntries()).toHaveLength(1);
  });

  it('sentido 2: si la escritura del cambio falla al confirmar, no queda la entrada', async () => {
    // El producto viaja junto con una actualización de un documento inexistente: Firestore rechaza la
    // confirmación entera, con la entrada de bitácora ya encolada en la misma transacción.
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

    await expect(setType(failingChange, 'digital')).resolves.toEqual(expect.objectContaining({ ok: false, code: 'audit-write-failed' }));
    expect((await productDoc()).get('kind')).toBe('physical');
    expect(await auditEntries()).toHaveLength(0);
  });
});

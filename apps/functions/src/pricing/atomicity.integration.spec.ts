import type { TransactionScope, UnitOfWork } from '@ecommerce/application';
import { createOwnerRole, productId } from '@ecommerce/domain';
import { firestore, FirestoreUnitOfWork } from '@ecommerce/infrastructure';
import { clearFirestoreEmulator } from '@ecommerce/infrastructure/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallableDependencies } from '../bootstrap/callable';
import { productionDependencies } from '../bootstrap/composition';
import { catalogCallables } from '../catalog/callables';
import { AT, callAs, member, T1 } from '../testing/harness';
import { pricingCallables } from './callables';

const db = firestore();
const usd = (amount: number) => ({ amount, currency: 'USD' });

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

// T038 — FR-030 y FR-033 a nivel de callable, contra Firestore: el cambio y su entrada de bitácora
// se confirman juntos o no se confirma ninguno. Las fallas son de Firestore al confirmar, no
// excepciones lanzadas antes: así se prueba la transacción real y no el orden del código.
describe('atomicidad de la bitácora en setVariantPrice', () => {
  let variantId: string;

  const variantDoc = () => db.doc(`tenants/t1/products/p1/variants/${variantId}`).get();
  const auditEntries = async () => (await db.collection('tenants/t1/auditLog').get()).docs;
  const setPrice = async (deps: CallableDependencies, amount: number) => {
    const version = (await variantDoc()).get('version') as number;
    return pricingCallables(deps).setVariantPrice.run(
      callAs('owner', { productId: 'p1', changes: [{ variantId, version, price: usd(amount) }] }),
    );
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
    variantId = created.data.variantId;
  });

  it('sin fallas, el precio y su entrada quedan juntos', async () => {
    await expect(setPrice(productionDependencies(), 1000)).resolves.toEqual(expect.objectContaining({ ok: true }));
    expect((await variantDoc()).get('price')).toEqual(usd(1000));
    expect(await auditEntries()).toHaveLength(1);
  });

  it('sentido 1: si la entrada no puede crearse, el precio no cambia', async () => {
    await setPrice(productionDependencies(), 1000);
    const [taken] = await auditEntries();
    // La entrada nueva reutiliza el id de una existente: `create` falla al confirmar.
    const colliding = decorated((tx) => ({
      ...tx,
      audit: { append: (entries) => tx.audit.append(entries.map((entry) => ({ ...entry, id: taken?.id as typeof entry.id }))) },
    }));

    await expect(setPrice(colliding, 2000)).resolves.toEqual(expect.objectContaining({ ok: false, code: 'audit-write-failed' }));
    expect((await variantDoc()).get('price')).toEqual(usd(1000));
    expect(await auditEntries()).toHaveLength(1);
  });

  it('sentido 2: si la escritura del cambio falla al confirmar, no queda la entrada', async () => {
    // La variante viaja junto con una actualización de un documento inexistente: Firestore rechaza
    // la confirmación entera, con la entrada de bitácora ya encolada en la misma transacción.
    const failingChange = decorated((tx) => ({
      ...tx,
      variants: {
        ...tx.variants,
        save: async (variant) => {
          await tx.variants.save(variant);
          await tx.products.updateVariantSummary(productId('no-existe'), { variantCount: 0, hasIncompleteVariants: false, missingShippingData: false });
        },
      },
    }));

    await expect(setPrice(failingChange, 2000)).resolves.toEqual(expect.objectContaining({ ok: false, code: 'audit-write-failed' }));
    expect((await variantDoc()).get('price')).toBeNull();
    expect(await auditEntries()).toHaveLength(0);
  });
});

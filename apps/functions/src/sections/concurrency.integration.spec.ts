import type { UnitOfWork } from '@ecommerce/application';
import { createOwnerRole, productId, type ProductId } from '@ecommerce/domain';
import { firestore, FirestoreUnitOfWork } from '@ecommerce/infrastructure';
import { clearFirestoreEmulator } from '@ecommerce/infrastructure/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CallableDependencies } from '../bootstrap/callable';
import { productionDependencies } from '../bootstrap/composition';
import { catalogCallables } from '../catalog/callables';
import { AT, callAs, member, T1 } from '../testing/harness';
import { sectionCallables } from './callables';

const db = firestore();
const occupied = (n: number): ProductId[] => Array.from({ length: n }, (_, i) => productId(`x${String(i).padStart(2, '0')}`));
const offers = async () => ((await db.doc('tenants/t1/storefront/sections').get()).get('offers') as string[]) ?? [];

/**
 * Las dependencias de producción con una barrera en la lectura de las secciones: las primeras
 * `racers` lecturas esperan a que lleguen todas. Así las transacciones leen la sección ANTES de que
 * alguna escriba —la carrera ocurre siempre, no por azar—, y un reintento ya no espera. `reads`
 * cuenta las lecturas: más de una por pedido prueba que la perdedora se reintentó.
 */
function racing(racers: number) {
  let arrived = 0;
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => (open = resolve));
  const counter = { reads: 0 };
  const real = productionDependencies();
  const deps: CallableDependencies = {
    ...real,
    unitOfWorkFor: (tenant): UnitOfWork => {
      const uow = real.unitOfWorkFor(tenant);
      return {
        run: (work) =>
          uow.run((tx) =>
            work({
              ...tx,
              sections: {
                ...tx.sections,
                get: async () => {
                  const read = await tx.sections.get();
                  counter.reads++;
                  if (arrived < racers) {
                    arrived++;
                    if (arrived === racers) open();
                    await opened;
                  }
                  return read;
                },
              },
            }),
          ),
      };
    },
  };
  return { deps, counter };
}

const add = (deps: CallableDependencies, ids: string[]) => sectionCallables(deps).addToSection.run(callAs('owner', { section: 'offers', productIds: ids }));

// T070 — Historia 3, SC-011 y FR-027b contra el emulador, con la UnitOfWork real: el tope de 40 lo
// garantiza la transacción sobre el documento de secciones, también con agregados simultáneos.
describe('tope de las secciones bajo concurrencia', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
    await db.doc('tenants/t1').set({ name: 'Uno', ownerUid: 'owner', currency: 'USD', createdAt: AT, createdBy: 'seed', status: 'active' });
    await new FirestoreUnitOfWork(db, T1).run(async (tx) => {
      await tx.roles.save(createOwnerRole(T1, AT));
      await tx.members.save(member('owner', 'owner', true));
    });
    const { createProduct } = catalogCallables(productionDependencies());
    for (const id of ['a', 'b', 'b1', 'b2']) {
      const created = await createProduct.run(callAs('owner', { requestId: id, name: `Producto ${id}`, description: '' }));
      if (!created.ok) throw new Error(JSON.stringify(created));
    }
  });

  const seed = (n: number) => new FirestoreUnitOfWork(db, T1).run((tx) => tx.sections.save({ featured: [], offers: occupied(n) }));

  it('con 39 de 40, dos agregados simultáneos: exactamente uno se confirma y el otro se rechaza entero', async () => {
    await seed(39);
    const { deps, counter } = racing(2);
    const results = await Promise.all([add(deps, ['a']), add(deps, ['b'])]);

    // La carrera ocurrió: las dos leyeron 39, y la perdedora se reintentó y leyó otra vez.
    expect(counter.reads).toBeGreaterThanOrEqual(3);
    const ok = results.filter((r) => r.ok);
    const rejected = results.filter((r) => !r.ok);
    expect(ok).toEqual([{ ok: true, data: { section: 'offers', count: 40 } }]);
    expect(rejected).toEqual([expect.objectContaining({ ok: false, code: 'section-full', details: { section: 'offers', remaining: 0, requested: 1 } })]);

    const final = await offers();
    expect(final).toHaveLength(40);
    expect(final.filter((id) => id === 'a' || id === 'b')).toHaveLength(1);
  });

  it('con 38, uno agrega 1 y otro agrega 2 a la vez: nunca pasa de 40, y el rechazado no deja ninguno', async () => {
    await seed(38);
    const { deps, counter } = racing(2);
    const [single, pair] = await Promise.all([add(deps, ['a']), add(deps, ['b1', 'b2'])]);

    expect(counter.reads).toBeGreaterThanOrEqual(3);
    expect([single, pair].filter((r) => r.ok)).toHaveLength(1);
    const final = await offers();
    expect(final.length).toBeLessThanOrEqual(40);
    if (single.ok) {
      expect(final).toContain('a');
      expect(final.filter((id) => id === 'b1' || id === 'b2')).toEqual([]);
      expect(pair).toEqual(expect.objectContaining({ code: 'section-full', details: { section: 'offers', remaining: 1, requested: 2 } }));
    } else {
      expect(final).toEqual(expect.arrayContaining(['b1', 'b2']));
      expect(final).not.toContain('a');
      expect(single).toEqual(expect.objectContaining({ code: 'section-full', details: { section: 'offers', remaining: 0, requested: 1 } }));
    }
  });
});

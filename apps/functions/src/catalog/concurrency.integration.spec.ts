import { createOwnerRole } from '@ecommerce/domain';
import { firestore, FirestoreUnitOfWork } from '@ecommerce/infrastructure';
import { clearFirestoreEmulator } from '@ecommerce/infrastructure/testing';
import { deleteApp, initializeApp } from 'firebase/app';
import { collection, connectFirestoreEmulator, doc, getFirestore, limit, onSnapshot, orderBy, query, terminate, where } from 'firebase/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { productionDependencies } from '../bootstrap/composition';
import { AT, callAs, member, T1 } from '../testing/harness';
import { catalogCallables } from './callables';

const db = firestore();

const createMany = (prefix: string, count: number) => {
  const { createProduct } = catalogCallables(productionDependencies());
  return Promise.all(
    Array.from({ length: count }, (_, i) => createProduct.run(callAs('owner', { requestId: `${prefix}${i}`, name: `Producto ${prefix}${i}`, description: '' }))),
  );
};

// Concurrencia en el mismo comercio: cada transacción lee la membresía (la guarda) y las escuchas
// del panel la leen también, en cada evaluación de reglas. Nada de eso puede bloquear a nadie.
describe('creaciones simultáneas en un comercio', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
    await db.doc('tenants/t1').set({ name: 'Uno', ownerUid: 'owner', currency: 'USD', createdAt: AT, createdBy: 'seed', status: 'active' });
    await new FirestoreUnitOfWork(db, T1).run(async (tx) => {
      await tx.roles.save(createOwnerRole(T1, AT));
      await tx.members.save(member('owner', 'owner', true));
    });
  });

  it('cinco a la vez terminan todas, y con productos distintos', async () => {
    const results = await createMany('p', 5);
    expect(results.every((r) => r.ok)).toBe(true);
    expect((await db.collection('tenants/t1/products').get()).size).toBe(5);
  });

  it('también con escuchas del panel abiertas, que evalúan reglas sobre la misma membresía', async () => {
    const app = initializeApp({ projectId: 'demo-ecommerce', apiKey: 'demo' }, 'panel-abierto');
    const web = getFirestore(app);
    const [host, port] = (process.env['FIRESTORE_EMULATOR_HOST'] ?? '127.0.0.1:8080').split(':');
    connectFirestoreEmulator(web, host ?? '127.0.0.1', Number(port), { mockUserToken: { sub: 'owner', user_id: 'owner' } });

    const listening = (open: (ready: () => void, fail: (error: unknown) => void) => () => void) =>
      new Promise<() => void>((resolve, reject) => {
        const stop = open(() => resolve(stop), reject);
      });
    const products = query(collection(web, 'tenants/t1/products'), where('archived', '==', false), orderBy('updatedAt', 'desc'), limit(25));
    const stops = await Promise.all([
      listening((ready, fail) => onSnapshot(products, ready, fail)),
      listening((ready, fail) => onSnapshot(doc(web, 'tenants/t1'), ready, fail)),
    ]);
    try {
      const results = await createMany('w', 3);
      expect(results.every((r) => r.ok)).toBe(true);
    } finally {
      for (const stop of stops) stop();
      await terminate(web);
      await deleteApp(app);
    }
  });
});

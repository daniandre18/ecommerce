import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { createRulesEnv, db, seed, USERS } from './env';

// T017 — casos 24, 25 y 27. Ninguna escritura sale del cliente: todas pasan por Cloud Functions.
describe('ninguna escritura desde el cliente', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => { env = await createRulesEnv(); });
  afterAll(async () => { await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env);
  });

  const as = (user: string) => db(env.authenticatedContext(user));

  it('caso 24: el colaborador de catálogo no escribe un producto directo', async () => {
    await assertFails(updateDoc(doc(as(USERS.catalog1), 'tenants/t1/products/p1'), { name: 'x' }));
  });

  // La prueba de que el rol de catálogo no escribe precios ni evitando la interfaz (FR-013).
  it('caso 25: el colaborador de catálogo no escribe el precio de una variante', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.catalog1), 'tenants/t1/products/p1/variants/v1'), {
        price: { amount: 1, currency: 'USD' },
      }),
    );
  });

  it('caso 27: ni el Propietario escribe un producto desde el cliente', async () => {
    await assertFails(setDoc(doc(as(USERS.owner1), 'tenants/t1/products/p2'), { name: 'x' }));
  });

  it('nadie puede fabricarse una membresía', async () => {
    await assertFails(
      setDoc(doc(as(USERS.outsider), 'tenants/t1/members/outsider'), {
        status: 'active',
        isOwner: true,
        roleId: 'owner',
      }),
    );
  });
});

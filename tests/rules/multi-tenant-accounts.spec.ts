import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { createRulesEnv, db, membership, seed, seedExtra, USERS } from './env';

// T062 — casos 8 a 14 (FR-005, FR-008, FR-008a): una cuenta, varias membresías independientes.
describe('cuentas en varios comercios', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => { env = await createRulesEnv(); });
  afterAll(async () => { await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env);
    // owner2 es Propietaria de t2 y, además, colaboradora de catálogo en t1.
    await seedExtra(env, { 'tenants/t1/members/owner2': membership(USERS.owner2, { status: 'active', roleId: 'catalog' }) });
  });

  const read = (user: string, path: string) => getDoc(doc(db(env.authenticatedContext(user)), path));

  it('casos 8 y 9: la misma cuenta lee el catálogo de los dos comercios', async () => {
    await assertSucceeds(read(USERS.multi1, 'tenants/t1/products/p1'));
    await assertSucceeds(read(USERS.multi1, 'tenants/t2/products/p1'));
  });

  it('casos 10 y 11: ser Propietaria en un comercio no concede nada en el otro', async () => {
    await assertSucceeds(read(USERS.owner2, 'tenants/t2/config/secrets'));
    await assertFails(read(USERS.owner2, 'tenants/t1/config/secrets'));
  });

  it('casos 12 y 13: la baja es por comercio', async () => {
    await seedExtra(env, { 'tenants/t2/members/multi1': membership(USERS.multi1, { status: 'disabled', roleId: 'catalog' }) });
    await assertSucceeds(read(USERS.multi1, 'tenants/t1/products/p1'));
    await assertFails(read(USERS.multi1, 'tenants/t2/products/p1'));
  });

  // Mismo contexto autenticado antes y después: el token no cambia, y aun así la baja rige.
  it('caso 14: la baja corta el acceso en la solicitud siguiente, sin esperar al token', async () => {
    const session = db(env.authenticatedContext(USERS.multi1));
    await assertSucceeds(getDoc(doc(session, 'tenants/t2/products/p1')));
    await seedExtra(env, { 'tenants/t2/members/multi1': membership(USERS.multi1, { status: 'disabled', roleId: 'catalog' }) });
    await assertFails(getDoc(doc(session, 'tenants/t2/products/p1')));
    await assertFails(getDoc(doc(session, 'tenants/t2')));
  });
});

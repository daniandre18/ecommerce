import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { createRulesEnv, db, membership, seed, seedExtra, USERS } from './env';

const COSTS = 'tenants/t1/products/p1/private/costs';

// T063 — casos 15 a 18 (FR-015): el costo solo lo ve quien tiene `variant.cost.read`, o el Propietario.
describe('costo de adquisición', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => { env = await createRulesEnv(); });
  afterAll(async () => { await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env);
    await seedExtra(env, {
      'tenants/t1/roles/precios': { permissions: ['catalog.read', 'variant.price.write'] },
      'tenants/t1/roles/costos': { permissions: ['catalog.read', 'variant.cost.read'] },
      'tenants/t1/members/pricer1': membership('pricer1', { status: 'active', roleId: 'precios' }),
      'tenants/t1/members/coster1': membership('coster1', { status: 'active', roleId: 'costos' }),
      'tenants/t1/members/coster2': membership('coster2', { status: 'disabled', roleId: 'costos' }),
    });
  });

  const readCosts = (user: string) => getDoc(doc(db(env.authenticatedContext(user)), COSTS));

  it('caso 15: el rol de Catálogo no lo lee', async () => {
    await assertFails(readCosts(USERS.catalog1));
  });

  it('caso 16: un rol que edita precios pero no tiene variant.cost.read, tampoco', async () => {
    await assertFails(readCosts('pricer1'));
  });

  it('caso 17: un rol con variant.cost.read lo lee', async () => {
    await assertSucceeds(readCosts('coster1'));
  });

  it('caso 18: el Propietario lo lee', async () => {
    await assertSucceeds(readCosts(USERS.owner1));
  });

  it('el permiso no sirve con la membresía dada de baja', async () => {
    await assertFails(readCosts('coster2'));
  });

  it('el permiso de un comercio no alcanza el costo de otro', async () => {
    await assertFails(getDoc(doc(db(env.authenticatedContext('coster1')), 'tenants/t2/products/p1/private/costs')));
  });
});

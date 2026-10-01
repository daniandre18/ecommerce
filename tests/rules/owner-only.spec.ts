import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { PERMISSIONS } from '@ecommerce/domain';
import { doc, getDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { createRulesEnv, db, membership, seed, seedExtra, USERS } from './env';

// T064 — casos 20 a 23 (FR-014): credenciales de pago y facturación son del Propietario y de nadie más.
describe('secretos y facturación', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => { env = await createRulesEnv(); });
  afterAll(async () => { await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env);
    // Un rol con TODOS los permisos que existen como concesión.
    await seedExtra(env, {
      'tenants/t1/roles/todo': { permissions: [...PERMISSIONS] },
      'tenants/t1/members/all1': membership('all1', { status: 'active', roleId: 'todo' }),
    });
  });

  const read = (user: string, path: string) => getDoc(doc(db(env.authenticatedContext(user)), path));

  it.each([
    ['caso 20: credenciales de pasarelas', 'tenants/t1/config/secrets'],
    ['caso 21: facturación', 'tenants/t1/config/billing'],
  ])('%s: el colaborador de catálogo no las lee', async (_label, path) => {
    await assertFails(read(USERS.catalog1, path));
  });

  it('caso 22: el Propietario sí', async () => {
    await assertSucceeds(read(USERS.owner1, 'tenants/t1/config/secrets'));
    await assertSucceeds(read(USERS.owner1, 'tenants/t1/config/billing'));
  });

  // Ningún permiso concedible alcanza: no existen como concesión.
  it('caso 23: un rol con todos los permisos concedibles tampoco', async () => {
    await assertFails(read('all1', 'tenants/t1/config/secrets'));
    await assertFails(read('all1', 'tenants/t1/config/billing'));
  });
});

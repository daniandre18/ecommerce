import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { createRulesEnv, db, seed, USERS } from './env';

// T015 — casos 1 a 7 de contracts/firestore-rules.md (FR-002, principio VI)
describe('aislamiento entre comercios', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => { env = await createRulesEnv(); });
  afterAll(async () => { await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env);
  });

  const as = (user: string) => db(env.authenticatedContext(user));

  it('caso 1: un miembro activo lee el catálogo de su comercio', async () => {
    await assertSucceeds(getDoc(doc(as(USERS.owner1), 'tenants/t1/products/p1')));
    await assertSucceeds(getDoc(doc(as(USERS.catalog1), 'tenants/t1/products/p1/variants/v1')));
  });

  it('caso 2: sin membresía en t2, no lee su catálogo', async () => {
    await assertFails(getDoc(doc(as(USERS.owner1), 'tenants/t2/products/p1')));
  });

  it('caso 3: tampoco conociendo el identificador exacto de un documento profundo', async () => {
    await assertFails(getDoc(doc(as(USERS.owner1), 'tenants/t2/products/p1/variants/v1')));
  });

  it('caso 4: una consulta a la colección ajena se deniega entera', async () => {
    await assertFails(getDocs(collection(as(USERS.owner1), 'tenants/t2/products')));
  });

  it('caso 5: sin autenticar no se lee nada', async () => {
    const anon = db(env.unauthenticatedContext());
    await assertFails(getDoc(doc(anon, 'tenants/t1/products/p1')));
  });

  it('caso 7: una invitación no aceptada no da acceso (FR-007)', async () => {
    await assertFails(getDoc(doc(as(USERS.invited1), 'tenants/t1/products/p1')));
  });

  // Caso 6 ampliado (FR-041, SC-013): una identidad autenticada sin ninguna membresía es la forma
  // que toma el operador de la plataforma. No lee nada de negocio, aunque conozca las rutas.
  describe('caso 6: identidad autenticada sin ninguna membresía', () => {
    it.each([
      'tenants/t1/products/p1',
      'tenants/t1/products/p1/variants/v1',
      'tenants/t1/products/p1/private/costs',
      'tenants/t1/config/secrets',
      'tenants/t1/config/billing',
      'tenants/t1/auditLog/e1',
      'tenants/t1/members/owner1',
    ])('no lee %s', async (path) => {
      await assertFails(getDoc(doc(as(USERS.outsider), path)));
    });
  });
});

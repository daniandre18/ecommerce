import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRulesEnv, db, seed, USERS } from './env';

// T075, caso 36 — una cuenta descubre sus comercios consultando sus propias membresías, en todos
// los comercios a la vez. Solo las suyas: la consulta tiene que filtrar por su uid.
describe('los comercios de una cuenta', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => { env = await createRulesEnv(); });
  afterAll(async () => { await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env);
  });

  const as = (user: string) => db(env.authenticatedContext(user));
  const membershipsOf = (user: string, of = user) => query(collectionGroup(as(user), 'members'), where('uid', '==', of));

  it('una cuenta lista sus membresías de todos los comercios', async () => {
    const found = await assertSucceeds(getDocs(membershipsOf(USERS.multi1)));
    expect(found.docs.map((d) => d.ref.parent.parent?.id).sort()).toEqual(['t1', 't2']);
  });

  it('no lista las de otra cuenta', async () => {
    await assertFails(getDocs(membershipsOf(USERS.multi1, USERS.owner1)));
  });

  it('una consulta que no filtra por su propio uid se deniega entera', async () => {
    await assertFails(getDocs(collectionGroup(as(USERS.multi1), 'members')));
  });

  it('sin sesión, nada', async () => {
    await assertFails(getDocs(query(collectionGroup(db(env.unauthenticatedContext()), 'members'), where('uid', '==', USERS.multi1))));
  });

  // Regresión: la regla nueva no cambia lo que ya valía.
  it('la Propietaria sigue listando el equipo de su comercio, y un colaborador no', async () => {
    await assertSucceeds(getDocs(collection(as(USERS.owner1), 'tenants/t1/members')));
    await assertFails(getDocs(collection(as(USERS.catalog1), 'tenants/t1/members')));
  });
});

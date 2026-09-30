import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { createRulesEnv, db, seed, USERS } from './env';

// T016 — casos 30, 31 y 32. La bitácora es inmutable para TODOS, incluido el Propietario (FR-032).
describe('bitácora inmutable', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => { env = await createRulesEnv(); });
  afterAll(async () => { await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env);
  });

  const owner = () => db(env.authenticatedContext(USERS.owner1));

  it('el Propietario puede leerla', async () => {
    await assertSucceeds(getDoc(doc(owner(), 'tenants/t1/auditLog/e1')));
  });

  it('caso 30: el Propietario no puede actualizar una entrada', async () => {
    await assertFails(updateDoc(doc(owner(), 'tenants/t1/auditLog/e1'), { actorUid: 'otro' }));
  });

  it('caso 31: el Propietario no puede borrar una entrada', async () => {
    await assertFails(deleteDoc(doc(owner(), 'tenants/t1/auditLog/e1')));
  });

  it('caso 32: el Propietario no puede crear una entrada a mano', async () => {
    await assertFails(setDoc(doc(owner(), 'tenants/t1/auditLog/forjada'), { type: 'price.changed' }));
  });
});

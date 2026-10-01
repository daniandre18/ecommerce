import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, getDocs, limit, orderBy, query, Timestamp, where, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRulesEnv, db, membership, seed, seedExtra, USERS } from './env';

const at = (minute: number) => Timestamp.fromDate(new Date(Date.UTC(2026, 8, 30, 12, minute)));

/** La consulta que hace la vista de bitácora: filtrada, ordenada por fecha y paginada. */
const byActor = (f: Firestore, tenant: string, actorUid: string) =>
  getDocs(query(collection(f, `tenants/${tenant}/auditLog`), where('actorUid', '==', actorUid), orderBy('at', 'desc'), limit(20)));

// T081 — casos 28 y 29: la bitácora la consulta el Propietario de su comercio y nadie más (FR-034).
describe('consulta de la bitácora', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => { env = await createRulesEnv(); });
  afterAll(async () => { await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env);
    await seedExtra(env, {
      'tenants/t1/auditLog/e2': { type: 'stock.adjusted', actorUid: 'catalog1', at: at(1), entity: { kind: 'variant', id: 'v1', productId: 'p1' } },
      'tenants/t1/auditLog/e3': { type: 'price.changed', field: 'cost', actorUid: 'owner1', at: at(2), entity: { kind: 'variant', id: 'v1', productId: 'p1' } },
      'tenants/t1/auditLog/e4': { type: 'stock.adjusted', actorUid: 'catalog1', at: at(3), entity: { kind: 'variant', id: 'v1', productId: 'p1' } },
    });
  });

  it('caso 28: el Propietario consulta la de su comercio, filtrada y en orden', async () => {
    const result = await assertSucceeds(byActor(db(env.authenticatedContext(USERS.owner1)), 't1', 'catalog1'));
    expect(result.docs.map((d) => d.id)).toEqual(['e4', 'e2']);
  });

  it('caso 29: el colaborador de catálogo no la consulta, ni siquiera sus propios cambios', async () => {
    await assertFails(byActor(db(env.authenticatedContext(USERS.catalog1)), 't1', 'catalog1'));
  });

  // Escenario 5 de la Historia 3: ser Propietario de otro comercio no abre esta bitácora.
  it('el Propietario de otro comercio no consulta la de este', async () => {
    await assertFails(byActor(db(env.authenticatedContext(USERS.owner2)), 't1', 'catalog1'));
  });

  // La bitácora incluye cambios de costo ("price.changed" con field "cost"), y Firestore no oculta
  // campos sueltos: abrirla a un rol con audit.read le mostraría costos sin variant.cost.read
  // (FR-015). Por eso queda solo para el Propietario, aunque el permiso exista.
  it('un rol con audit.read tampoco la consulta: vería costos sin tener el permiso de costo', async () => {
    await seedExtra(env, {
      'tenants/t1/roles/auditor': { permissions: ['catalog.read', 'audit.read'] },
      'tenants/t1/members/auditor1': membership('auditor1', { status: 'active', roleId: 'auditor' }),
    });
    await assertFails(byActor(db(env.authenticatedContext('auditor1')), 't1', 'catalog1'));
  });
});

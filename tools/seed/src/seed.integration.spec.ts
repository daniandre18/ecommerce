import { auth, firestore } from '@ecommerce/infrastructure';
import { clearFirestoreEmulator } from '@ecommerce/infrastructure/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, seed } from './seed';

const db = firestore();
const member = async (tenant: string, account: string) =>
  (await db.doc(`tenants/${tenant}/members/${account}`).get()).data();
const role = async (tenant: string, id: string) => (await db.doc(`tenants/${tenant}/roles/${id}`).get()).data();

// T031 — el escenario de quickstart.md, contra los emuladores de Auth y Firestore.
describe('sembrador', () => {
  beforeAll(async () => {
    await clearFirestoreEmulator(); // el escenario de quickstart.md parte de un emulador vacío
    await seed();
    await seed(); // idempotente: la segunda corrida no duplica ni rompe nada
  });

  it('crea las cuentas en Auth', async () => {
    for (const account of Object.values(ACCOUNTS)) {
      await expect(auth().getUser(account.uid)).resolves.toEqual(expect.objectContaining({ email: account.email }));
    }
  });

  it('los comercios operan en pesos colombianos', async () => {
    for (const tenant of ['t1', 't2']) {
      expect((await db.doc(`tenants/${tenant}`).get()).get('currency')).toBe('COP');
    }
  });

  it('cada comercio tiene exactamente un Propietario (FR-011)', async () => {
    for (const tenant of ['t1', 't2']) {
      const owners = await db.collection(`tenants/${tenant}/members`).where('isOwner', '==', true).get();
      expect(owners.size).toBe(1);
    }
  });

  it('multi es Propietaria de t2 y colaboradora de catálogo en t1 (FR-005)', async () => {
    expect(await member('t2', ACCOUNTS.multi.uid)).toEqual(expect.objectContaining({ isOwner: true, status: 'active' }));
    expect(await member('t1', ACCOUNTS.multi.uid)).toEqual(
      expect.objectContaining({ isOwner: false, roleId: 'catalog', status: 'active' }),
    );
  });

  it('el rol de Catálogo no concede precios ni costo (FR-016)', async () => {
    const catalog = await role('t1', 'catalog');
    expect(catalog?.['permissions']).toEqual(['catalog.read', 'catalog.write', 'variant.stock.write']);
  });

  it('memberCount coincide con las membresías: es lo que bloquea borrar un rol en uso (FR-013)', async () => {
    expect((await role('t1', 'owner'))?.['memberCount']).toBe(1);
    expect((await role('t1', 'catalog'))?.['memberCount']).toBe(2);
    expect((await role('t2', 'catalog'))?.['memberCount']).toBe(0);
  });
});

describe('sembrador fuera de los emuladores', () => {
  it('se niega a correr contra un proyecto que no es demo-*', async () => {
    const previous = process.env['GCLOUD_PROJECT'];
    process.env['GCLOUD_PROJECT'] = 'mi-comercio-produccion';
    try {
      await expect(seed()).rejects.toThrow('solo corre contra emuladores');
    } finally {
      process.env['GCLOUD_PROJECT'] = previous;
    }
  });
});

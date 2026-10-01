import { createCustomRole, presetRoles, roleId, setRolePermissions } from '@ecommerce/domain';
import { firestore, FirestoreUnitOfWork } from '@ecommerce/infrastructure';
import { clearFirestoreEmulator } from '@ecommerce/infrastructure/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { productionDependencies } from '../bootstrap/composition';
import { AT, callAs, member, T1 } from '../testing/harness';
import { teamCallables } from './callables';

const db = firestore();

/** La única entrada de bitácora que dejó una operación, leída de Firestore. */
async function onlyEntry() {
  const docs = (await db.collection('tenants/t1/auditLog').get()).docs;
  expect(docs).toHaveLength(1);
  return docs[0]!.data();
}

// T082 — FR-031a contra Firestore: cada cambio de equipo deja su propia entrada, con el estado
// anterior y el resultante, el responsable y el momento. Escenario 6 de la Historia 3.
describe('cobertura de la bitácora en los cambios de equipo', () => {
  const team = teamCallables(productionDependencies());

  beforeEach(async () => {
    await clearFirestoreEmulator();
    await db.doc('tenants/t1').set({ name: 'Uno', ownerUid: 'owner', currency: 'COP', createdAt: AT, createdBy: 'seed', status: 'active' });
    await new FirestoreUnitOfWork(db, T1).run(async (tx) => {
      const [owner, catalog] = presetRoles(T1, AT);
      await tx.roles.save({ ...owner!, memberCount: 1 });
      await tx.roles.save({ ...catalog!, memberCount: 2 });
      await tx.roles.save(setRolePermissions(createCustomRole(roleId('precios'), T1, 'Precios', AT), ['catalog.read', 'variant.price.write']));
      await tx.members.save(member('owner', 'owner', true));
      await tx.members.save(member('ana', 'catalog'));
      await tx.members.save(member('beto', 'catalog'));
    });
  });

  const expectCommon = (entry: FirebaseFirestore.DocumentData, change: string) =>
    expect(entry).toEqual(expect.objectContaining({ type: 'role.changed', change, actorUid: 'owner', actorKind: 'member', at: expect.anything() }));

  it('quitarle un permiso a un rol anota el conjunto anterior y el resultante', async () => {
    await expect(team.updateRole.run(callAs('owner', { roleId: 'catalog', permissions: ['catalog.read', 'catalog.write'] }))).resolves.toMatchObject({ ok: true });
    const entry = await onlyEntry();
    expectCommon(entry, 'role.updated');
    expect(entry['entity']).toEqual({ kind: 'role', id: 'catalog' });
    expect(entry['before']).toEqual(expect.objectContaining({ permissions: ['catalog.read', 'catalog.write', 'variant.stock.write'] }));
    expect(entry['after']).toEqual(expect.objectContaining({ permissions: ['catalog.read', 'catalog.write'] }));
  });

  it('reasignar a una colaboradora anota el rol anterior y el nuevo', async () => {
    await expect(team.assignRole.run(callAs('owner', { uid: 'ana', roleId: 'precios' }))).resolves.toMatchObject({ ok: true });
    const entry = await onlyEntry();
    expectCommon(entry, 'role.assigned');
    expect(entry['entity']).toEqual({ kind: 'membership', id: 'ana' });
    expect(entry['before']).toEqual({ roleId: 'catalog', roleName: 'Catálogo' });
    expect(entry['after']).toEqual({ roleId: 'precios', roleName: 'Precios' });
  });

  it('dar de baja a otra anota el estado anterior y el resultante', async () => {
    await expect(team.setMembershipEnabled.run(callAs('owner', { uid: 'beto', enabled: false }))).resolves.toMatchObject({ ok: true });
    const entry = await onlyEntry();
    expectCommon(entry, 'membership.disabled');
    expect(entry['entity']).toEqual({ kind: 'membership', id: 'beto' });
    expect([entry['before'], entry['after']]).toEqual([{ status: 'active' }, { status: 'disabled' }]);
  });

  it('traspasar la propiedad anota quién la tenía y quién la tiene', async () => {
    await expect(team.transferOwnership.run(callAs('owner', { toUid: 'ana', newRoleIdForCurrentOwner: 'catalog' }))).resolves.toMatchObject({ ok: true });
    const entry = await onlyEntry();
    expectCommon(entry, 'ownership.transferred');
    expect(entry['entity']).toEqual({ kind: 'tenant', id: 't1' });
    expect([entry['before'], entry['after']]).toEqual([
      { uid: 'owner', isOwner: true },
      { uid: 'ana', isOwner: true },
    ]);
  });
});

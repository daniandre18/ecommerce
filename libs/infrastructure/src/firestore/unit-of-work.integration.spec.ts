import type { TransactionScope } from '@ecommerce/application';
import { activateMembership, inviteMembership, roleId, RoleNotDeletableError, tenantId, uid } from '@ecommerce/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { firestore } from './firestore';
import { roleChangedEntry } from './testing/fixtures';
import { FirestoreUnitOfWork } from './unit-of-work';

const db = firestore();
const T1 = tenantId('t1');
const AT = new Date('2026-09-30T12:00:00Z');

async function clearEmulator(): Promise<void> {
  const host = process.env['FIRESTORE_EMULATOR_HOST'];
  if (!host) throw new Error('FIRESTORE_EMULATOR_HOST no definido: correr con firebase emulators:exec');
  await fetch(`http://${host}/emulator/v1/projects/demo-ecommerce/databases/(default)/documents`, { method: 'DELETE' });
}

const ana = () =>
  activateMembership(
    inviteMembership({ uid: uid('ana'), tenantId: T1, roleId: roleId('catalog'), displayName: 'Ana', email: 'a@t1', at: AT }),
    AT,
  );

/** Lee a Ana dentro de la transacción; falla con un mensaje claro si la siembra no la creó. */
async function findAna(tx: TransactionScope) {
  const member = await tx.members.findByUid(uid('ana'));
  if (!member) throw new Error('La siembra no creó la membresía de Ana');
  return member;
}

const memberRoleId = async (tenant: string, memberUid: string) =>
  (await db.doc(`tenants/${tenant}/members/${memberUid}`).get()).data()?.['roleId'];
const auditEntryCount = async (tenant: string) =>
  (await db.collection(`tenants/${tenant}/auditLog`).get()).size;

// T025 — FR-030 y FR-033: el cambio y su entrada de bitácora son una unidad indivisible.
describe('FirestoreUnitOfWork contra el emulador', () => {
  const uow = new FirestoreUnitOfWork(db, T1);

  beforeEach(async () => {
    await clearEmulator();
    await uow.run(async (tx) => tx.members.save(ana()));
  });

  it('confirma juntos el cambio y su entrada', async () => {
    await uow.run(async (tx) => {
      const member = await findAna(tx);
      await tx.members.save({ ...member, roleId: roleId('pricing') });
      await tx.audit.append([roleChangedEntry(T1, 'e1')]);
    });
    expect(await memberRoleId('t1', 'ana')).toBe('pricing');
    expect(await auditEntryCount('t1')).toBe(1);
  });

  it('sentido 1: si la entrada de bitácora falla al confirmar, el cambio NO queda', async () => {
    await uow.run(async (tx) => tx.audit.append([roleChangedEntry(T1, 'dup')]));

    const attempt = uow.run(async (tx) => {
      const member = await findAna(tx);
      await tx.members.save({ ...member, roleId: roleId('pricing') });
      await tx.audit.append([roleChangedEntry(T1, 'dup')]); // id repetido: `create` falla al confirmar
    });

    await expect(attempt).rejects.toThrow();
    expect(await memberRoleId('t1', 'ana')).toBe('catalog');
    expect(await auditEntryCount('t1')).toBe(1); // solo la entrada previa
  });

  it('sentido 2: si el cambio falla después de encolar la entrada, la entrada NO queda', async () => {
    const attempt = uow.run(async (tx) => {
      await tx.members.findByUid(uid('ana'));
      await tx.audit.append([roleChangedEntry(T1, 'huerfana')]);
      throw new Error('el cambio no pudo aplicarse');
    });

    await expect(attempt).rejects.toThrow('el cambio no pudo aplicarse');
    expect(await auditEntryCount('t1')).toBe(0);
  });

  it('una entrada existente nunca se sobrescribe, ni desde el servidor', async () => {
    await uow.run(async (tx) => tx.audit.append([roleChangedEntry(T1, 'x')]));
    await expect(uow.run(async (tx) => tx.audit.append([roleChangedEntry(T1, 'x')]))).rejects.toThrow();
  });

  it('no borra un rol con miembros asignados (FR-013)', async () => {
    await db.doc('tenants/t1/roles/catalog').set({ name: 'Catálogo', permissions: [], memberCount: 2, editable: true, createdAt: AT });
    await expect(uow.run(async (tx) => tx.roles.delete(roleId('catalog')))).rejects.toThrow(RoleNotDeletableError);
    expect((await db.doc('tenants/t1/roles/catalog').get()).exists).toBe(true);
  });

  it('no borra el rol de Propietario, aunque no tenga miembros contados (FR-016)', async () => {
    await db.doc('tenants/t1/roles/owner').set({ name: 'Propietario', permissions: [], memberCount: 0, editable: false, preset: 'owner', createdAt: AT });
    await expect(uow.run(async (tx) => tx.roles.delete(roleId('owner')))).rejects.toThrow(RoleNotDeletableError);
    expect((await db.doc('tenants/t1/roles/owner').get()).exists).toBe(true);
  });

  it('borra un rol propio sin miembros', async () => {
    await db.doc('tenants/t1/roles/temporal').set({ name: 'Temporal', permissions: [], memberCount: 0, editable: true, createdAt: AT });
    await uow.run(async (tx) => tx.roles.delete(roleId('temporal')));
    expect((await db.doc('tenants/t1/roles/temporal').get()).exists).toBe(false);
  });

  it('una unidad de trabajo de t1 no alcanza datos de t2: el comercio se fija al construirla', async () => {
    await db.doc('tenants/t2/members/ana').set({ roleId: 'otro', status: 'active', isOwner: false, invitedAt: AT });

    const seen = await uow.run(async (tx) => tx.members.findByUid(uid('ana')));
    expect(seen?.roleId).toBe('catalog');

    await uow.run(async (tx) => {
      const member = await findAna(tx);
      await tx.members.save({ ...member, roleId: roleId('cambiado') });
    });
    expect(await memberRoleId('t2', 'ana')).toBe('otro');
  });
});

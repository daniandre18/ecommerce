import {
  AcceptInvitation,
  InviteCollaborator,
  TransferOwnership,
  type OperationContext,
  type TransactionScope,
  type UseCaseDependencies,
} from '@ecommerce/application';
import { activateMembership, inviteMembership, presetRoles, roleId, tenantId, uid } from '@ecommerce/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearFirestoreEmulator } from '../testing/emulator';
import { firestore } from './firestore';
import { FirestoreUnitOfWork } from './unit-of-work';

const db = firestore();
const T1 = tenantId('t1');
const NOW = new Date('2026-09-30T12:00:00Z');
const owner: OperationContext = { tenantId: T1, actorUid: uid('owner'), actorName: 'Dueña', actorEmail: 'owner@t1.test', requestId: 'r' };
const newcomer: OperationContext = { tenantId: T1, actorUid: uid('nueva'), actorName: 'Nueva', actorEmail: 'Nueva@Correo.test', requestId: 'r' };

interface UseCase<I, O> {
  execute(tx: TransactionScope, ctx: OperationContext, input: I): Promise<O>;
}

// T069, T072, T073 contra Firestore: invitaciones, membresía por correo y traspaso.
describe('equipo sobre Firestore', () => {
  const uow = new FirestoreUnitOfWork(db, T1);
  let n = 0;
  const deps: UseCaseDependencies = { clock: { now: () => NOW }, ids: { next: () => `id-${++n}` } };
  const run = <I, O>(useCase: UseCase<I, O>, input: I, ctx: OperationContext) => uow.run((tx) => useCase.execute(tx, ctx, input));
  const raw = async (path: string) => (await db.doc(`tenants/t1/${path}`).get()).data();

  beforeEach(async () => {
    await clearFirestoreEmulator();
    n = 0;
    await db.doc('tenants/t1').set({ name: 'Uno', ownerUid: 'owner', currency: 'COP', createdAt: NOW, createdBy: 'seed', status: 'active' });
    await uow.run(async (tx) => {
      for (const role of presetRoles(T1, NOW)) await tx.roles.save({ ...role, memberCount: 1 });
      const invited = (user: string, role: string) =>
        inviteMembership({ uid: uid(user), tenantId: T1, roleId: roleId(role), displayName: user, email: `${user}@t1.test`, at: NOW });
      await tx.members.save({ ...activateMembership(invited('owner', 'owner'), NOW), isOwner: true });
      await tx.members.save(activateMembership(invited('ana', 'catalog'), NOW));
    });
  });

  it('la invitación aceptada crea la membresía con su uid y el correo normalizado, y la anota', async () => {
    const { invitationId } = await run(new InviteCollaborator(deps), { email: 'NUEVA@correo.test', roleId: roleId('catalog') }, owner);
    expect(await raw(`invitations/${invitationId}`)).toEqual(expect.objectContaining({ email: 'nueva@correo.test', status: 'pending' }));

    await run(new AcceptInvitation(deps), { invitationId }, newcomer);
    expect(await raw('members/nueva')).toEqual(expect.objectContaining({ uid: 'nueva', email: 'nueva@correo.test', status: 'active', roleId: 'catalog' }));
    expect((await raw('roles/catalog'))?.['memberCount']).toBe(2);
    const entries = (await db.collection('tenants/t1/auditLog').get()).docs.map((d) => d.get('change'));
    expect(entries.sort()).toEqual(['invitation.sent', 'membership.added']);
  });

  it('el correo de un miembro se encuentra sin importar mayúsculas: no se lo invita', async () => {
    await expect(run(new InviteCollaborator(deps), { email: 'ANA@t1.test', roleId: roleId('catalog') }, owner)).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('invitar dos veces al mismo correo deja una sola invitación pendiente', async () => {
    await run(new InviteCollaborator(deps), { email: 'nueva@correo.test', roleId: roleId('catalog') }, owner);
    await run(new InviteCollaborator(deps), { email: 'nueva@correo.test', roleId: roleId('catalog') }, owner);
    expect((await db.collection('tenants/t1/invitations').get()).size).toBe(1);
  });

  it('el traspaso cambia el comercio y las dos membresías juntos', async () => {
    await run(new TransferOwnership(deps), { toUid: uid('ana'), newRoleIdForCurrentOwner: roleId('catalog') }, owner);
    expect((await db.doc('tenants/t1').get()).get('ownerUid')).toBe('ana');
    expect(await raw('members/ana')).toEqual(expect.objectContaining({ isOwner: true, roleId: 'owner' }));
    expect(await raw('members/owner')).toEqual(expect.objectContaining({ isOwner: false, roleId: 'catalog' }));
  });
});

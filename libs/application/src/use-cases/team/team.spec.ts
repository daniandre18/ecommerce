import {
  activateMembership,
  CATALOG_ROLE_ID,
  createCatalogRole,
  createOwnerRole,
  disableMembership,
  inviteMembership,
  OWNER_ROLE_ID,
  roleId,
  uid,
  type Membership,
  type Role,
} from '@ecommerce/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { PermissionDeniedError } from '../../ports/authorization';
import type { OperationContext } from '../../ports/operation-context';
import { ctx, failureOf, NOW, setup } from '../testing/fixture';
import { AcceptInvitation, InviteCollaborator, RevokeInvitation } from './invitations';
import { AssignRole, SetMembershipEnabled, TransferOwnership } from './memberships';
import { CreateRole, DeleteRole, UpdateRole } from './roles';

const DAY = 24 * 60 * 60 * 1000;
const owner: OperationContext = { ...ctx, actorUid: uid('owner'), actorName: 'Dueña', actorEmail: 'owner@t1.test' };
const newcomer: OperationContext = { ...ctx, actorUid: uid('nueva'), actorName: 'Nueva', actorEmail: 'nueva@correo.test' };

function member(user: string, role: string, isOwner = false): Membership {
  const invited = inviteMembership({ uid: uid(user), tenantId: ctx.tenantId, roleId: roleId(role), displayName: user, email: `${user}@t1.test`, at: NOW });
  return { ...activateMembership(invited, NOW), isOwner };
}

// T071–T073 — equipo, roles y permisos. Todo lo exige el Propietario salvo aceptar una invitación,
// y todo deja su entrada de bitácora (FR-031a).
describe('equipo', () => {
  let t: ReturnType<typeof setup>;
  const role = (id: string): Role | undefined => t.uow.store.roles.get(roleId(id));
  const membership = (user: string): Membership | undefined => t.uow.store.members.get(uid(user));
  const lastAudit = () => t.uow.store.audit.at(-1);

  beforeEach(() => {
    t = setup();
    t.uow.store.roles.set(OWNER_ROLE_ID, { ...createOwnerRole(ctx.tenantId, NOW), memberCount: 1 });
    t.uow.store.roles.set(CATALOG_ROLE_ID, { ...createCatalogRole(ctx.tenantId, NOW), memberCount: 1 });
    t.uow.store.members.set(uid('owner'), member('owner', 'owner', true));
    t.uow.store.members.set(uid('ana'), member('ana', 'catalog'));
  });

  describe('roles', () => {
    it('un rol nace sin permisos (FR-009), y queda en la bitácora', async () => {
      const { roleId: id } = await t.run(new CreateRole(t.deps), { name: ' Precios ' }, owner);
      expect(role(id)).toEqual(expect.objectContaining({ name: 'Precios', permissions: [], preset: null, editable: true, memberCount: 0 }));
      expect(lastAudit()).toEqual(
        expect.objectContaining({ type: 'role.changed', change: 'role.created', before: null, after: { roleId: id, roleName: 'Precios', permissions: [] } }),
      );
    });

    it('duplicar un rol copia sus permisos: el de Catálogo es una plantilla (FR-013, FR-016)', async () => {
      const { roleId: id } = await t.run(new CreateRole(t.deps), { name: 'Catálogo con precios', copyFrom: CATALOG_ROLE_ID }, owner);
      expect(role(id)?.permissions).toEqual(['catalog.read', 'catalog.write', 'variant.stock.write']);
    });

    it('dos roles no pueden llamarse igual', async () => {
      expect(await failureOf(t.run(new CreateRole(t.deps), { name: 'catálogo' }, owner))).toEqual(expect.objectContaining({ code: 'invalid-argument' }));
    });

    it('cambiar los permisos deja en la bitácora el conjunto anterior y el resultante (FR-031a)', async () => {
      await t.run(new UpdateRole(t.deps), { roleId: CATALOG_ROLE_ID, permissions: ['catalog.read', 'catalog.write', 'variant.stock.write', 'variant.price.write'] }, owner);
      expect(role('catalog')?.permissions).toContain('variant.price.write');
      expect(lastAudit()).toEqual(
        expect.objectContaining({
          change: 'role.updated',
          before: expect.objectContaining({ permissions: ['catalog.read', 'catalog.write', 'variant.stock.write'] }),
          after: expect.objectContaining({ permissions: ['catalog.read', 'catalog.write', 'variant.stock.write', 'variant.price.write'] }),
        }),
      );
    });

    it('un permiso que no existe se rechaza: el comercio no inventa permisos (FR-012)', async () => {
      expect(await failureOf(t.run(new UpdateRole(t.deps), { roleId: CATALOG_ROLE_ID, permissions: ['config.secrets'] }, owner))).toEqual(
        expect.objectContaining({ code: 'invalid-argument' }),
      );
    });

    it('el rol Propietario no se edita (FR-016)', async () => {
      await expect(t.run(new UpdateRole(t.deps), { roleId: OWNER_ROLE_ID, name: 'Otro' }, owner)).rejects.toThrow(PermissionDeniedError);
    });

    it('un rol con colaboradores no se borra: hay que reasignarlos antes (FR-013)', async () => {
      expect(await failureOf(t.run(new DeleteRole(t.deps), { roleId: CATALOG_ROLE_ID }, owner))).toEqual({
        code: 'invalid-argument',
        details: { memberCount: 1 },
      });
    });

    it('un rol sin colaboradores se borra, y queda en la bitácora', async () => {
      const { roleId: id } = await t.run(new CreateRole(t.deps), { name: 'Temporal' }, owner);
      await t.run(new DeleteRole(t.deps), { roleId: id }, owner);
      expect(role(id)).toBeUndefined();
      expect(lastAudit()).toEqual(expect.objectContaining({ change: 'role.deleted', after: null }));
    });
  });

  describe('invitaciones', () => {
    const invite = (email = 'nueva@correo.test', target = CATALOG_ROLE_ID) => t.run(new InviteCollaborator(t.deps), { email, roleId: target }, owner);
    const accept = (invitationId: string, as: OperationContext = newcomer) =>
      t.run(new AcceptInvitation(t.deps), { invitationId: invitationId as never }, as);

    it('invitar deja una invitación pendiente, con su enlace, y la anota (FR-006)', async () => {
      const { invitationId, token } = await invite();
      expect(token).toBe(`t1/${invitationId}`);
      expect(t.uow.store.invitations.get(invitationId)).toEqual(expect.objectContaining({ status: 'pending', email: 'nueva@correo.test', roleId: 'catalog' }));
      expect(lastAudit()).toEqual(expect.objectContaining({ change: 'invitation.sent', entity: { kind: 'invitation', id: invitationId } }));
    });

    it('no se invita a quien ya es miembro de este comercio', async () => {
      expect(await failureOf(invite('ANA@t1.test'))).toEqual(expect.objectContaining({ code: 'invalid-argument' }));
    });

    it('invitar de nuevo al mismo correo reenvía la pendiente: no la duplica', async () => {
      const first = await invite();
      const second = await invite('nueva@correo.test');
      expect(second.invitationId).toBe(first.invitationId);
      expect(t.uow.store.invitations.size).toBe(1);
    });

    it('no se invita con el rol Propietario: la propiedad se traspasa (FR-011)', async () => {
      expect(await failureOf(invite('x@correo.test', OWNER_ROLE_ID))).toEqual(expect.objectContaining({ code: 'invalid-argument' }));
    });

    it('aceptar crea la membresía activa con el rol de la invitación, y la anota quien acepta', async () => {
      const { invitationId } = await invite();
      await accept(invitationId);
      expect(membership('nueva')).toEqual(expect.objectContaining({ status: 'active', roleId: 'catalog', isOwner: false, email: 'nueva@correo.test' }));
      expect(role('catalog')?.memberCount).toBe(2);
      expect(t.uow.store.invitations.get(invitationId as never)?.status).toBe('accepted');
      expect(lastAudit()).toEqual(expect.objectContaining({ change: 'membership.added', actorUid: 'nueva' }));
    });

    it('aceptar solo exige una cuenta con sesión: todavía no es miembro', () => {
      expect(AcceptInvitation.requires).toEqual({ kind: 'account' });
    });

    it('una invitación es para su correo: otra cuenta no la acepta', async () => {
      const { invitationId } = await invite();
      const other = { ...newcomer, actorUid: uid('otra'), actorEmail: 'otra@correo.test' };
      expect(await failureOf(accept(invitationId, other))).toEqual(expect.objectContaining({ code: 'invalid-argument', details: { reason: 'email-mismatch' } }));
      expect(membership('otra')).toBeUndefined();
    });

    it('quien ya es miembro activo no la acepta de nuevo', async () => {
      const { invitationId } = await invite();
      t.uow.store.members.set(uid('nueva'), { ...member('nueva', 'catalog'), email: 'nueva@correo.test' });
      expect(await failureOf(accept(invitationId))).toEqual(expect.objectContaining({ code: 'invalid-argument', details: { reason: 'already-member' } }));
    });

    it('vencida, no se acepta', async () => {
      const { invitationId } = await invite();
      t.deps.clock.now = () => new Date(NOW.getTime() + 15 * DAY);
      expect(await failureOf(accept(invitationId))).toEqual(expect.objectContaining({ code: 'invalid-argument', details: { reason: 'expired' } }));
    });

    it('revocada, no se acepta, y la revocación queda anotada', async () => {
      const { invitationId } = await invite();
      await t.run(new RevokeInvitation(t.deps), { invitationId: invitationId as never }, owner);
      expect(lastAudit()).toEqual(expect.objectContaining({ change: 'invitation.revoked' }));
      expect(await failureOf(accept(invitationId))).toEqual(expect.objectContaining({ details: { reason: 'revoked' } }));
    });

    // FR-005: la cuenta ya existe en otro comercio; acá se le suma una membresía, no otra cuenta.
    it('quien estuvo de baja y vuelve a ser invitado recupera su membresía, con el rol nuevo', async () => {
      t.uow.store.members.set(uid('nueva'), disableMembership({ ...member('nueva', 'catalog'), email: 'nueva@correo.test' }, NOW));
      const { roleId: precios } = await t.run(new CreateRole(t.deps), { name: 'Precios' }, owner);
      const { invitationId } = await invite('nueva@correo.test', precios);
      await accept(invitationId);
      expect(membership('nueva')).toEqual(expect.objectContaining({ status: 'active', roleId: precios }));
      expect(role('catalog')?.memberCount).toBe(0);
      expect(role(precios)?.memberCount).toBe(1);
    });
  });

  describe('membresías', () => {
    it('cambiar el rol de un colaborador actualiza los contadores y lo anota (FR-008)', async () => {
      const { roleId: precios } = await t.run(new CreateRole(t.deps), { name: 'Precios' }, owner);
      await t.run(new AssignRole(t.deps), { uid: uid('ana'), roleId: precios }, owner);
      expect(membership('ana')?.roleId).toBe(precios);
      expect([role('catalog')?.memberCount, role(precios)?.memberCount]).toEqual([0, 1]);
      expect(lastAudit()).toEqual(
        expect.objectContaining({ change: 'role.assigned', before: expect.objectContaining({ roleId: 'catalog' }), after: expect.objectContaining({ roleId: precios }) }),
      );
    });

    it('el rol de la Propietaria no se cambia así: se traspasa la propiedad', async () => {
      expect(await failureOf(t.run(new AssignRole(t.deps), { uid: uid('owner'), roleId: CATALOG_ROLE_ID }, owner))).toEqual(
        expect.objectContaining({ code: 'invalid-argument' }),
      );
    });

    it('la baja es de la membresía en este comercio, se anota, y se puede revertir (FR-008a)', async () => {
      await expect(t.run(new SetMembershipEnabled(t.deps), { uid: uid('ana'), enabled: false }, owner)).resolves.toEqual({ status: 'disabled' });
      expect(lastAudit()).toEqual(expect.objectContaining({ change: 'membership.disabled' }));
      await expect(t.run(new SetMembershipEnabled(t.deps), { uid: uid('ana'), enabled: true }, owner)).resolves.toEqual({ status: 'active' });
      expect(lastAudit()).toEqual(expect.objectContaining({ change: 'membership.reactivated' }));
    });

    it('a la Propietaria no se la da de baja: el comercio no queda sin Propietario (FR-011)', async () => {
      expect(await failureOf(t.run(new SetMembershipEnabled(t.deps), { uid: uid('owner'), enabled: false }, owner))).toEqual(
        expect.objectContaining({ code: 'invalid-argument' }),
      );
    });

    // FR-011: exactamente un Propietario antes y después.
    it('el traspaso deja exactamente una Propietaria, y la anterior queda con el rol elegido', async () => {
      await expect(t.run(new TransferOwnership(t.deps), { toUid: uid('ana'), newRoleIdForCurrentOwner: CATALOG_ROLE_ID }, owner)).resolves.toEqual({ ownerUid: 'ana' });
      const owners = [...t.uow.store.members.values()].filter((m) => m.isOwner);
      expect(owners.map((m) => [m.uid, m.roleId])).toEqual([['ana', 'owner']]);
      expect(membership('owner')).toEqual(expect.objectContaining({ isOwner: false, roleId: 'catalog' }));
      expect(t.uow.store.tenant?.ownerUid).toBe('ana');
      expect([role('owner')?.memberCount, role('catalog')?.memberCount]).toEqual([1, 1]);
      expect(lastAudit()).toEqual(expect.objectContaining({ change: 'ownership.transferred' }));
    });

    it('no se traspasa a una membresía dada de baja ni a sí misma', async () => {
      t.uow.store.members.set(uid('ana'), disableMembership(member('ana', 'catalog'), NOW));
      for (const toUid of ['ana', 'owner']) {
        expect(await failureOf(t.run(new TransferOwnership(t.deps), { toUid: uid(toUid), newRoleIdForCurrentOwner: CATALOG_ROLE_ID }, owner))).toEqual(
          expect.objectContaining({ code: 'invalid-argument' }),
        );
      }
    });
  });

  it('todo lo de equipo lo exige el Propietario, salvo aceptar una invitación (FR-014)', () => {
    for (const UseCase of [CreateRole, UpdateRole, DeleteRole, InviteCollaborator, RevokeInvitation, AssignRole, SetMembershipEnabled, TransferOwnership]) {
      expect(UseCase.requires).toEqual({ kind: 'owner' });
    }
  });
});

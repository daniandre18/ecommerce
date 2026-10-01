import { CATALOG_ROLE_ID, createCatalogRole, createOwnerRole, OWNER_ROLE_ID, roleId, uid } from '@ecommerce/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { AT, callRequest, harness, httpsErrorCode, T1 } from '../testing/harness';
import { teamCallables } from './callables';

const asOwner = (data: Record<string, unknown>) => callRequest({ auth: { uid: 'owner', email: 'owner@t1.test' }, data: { tenantId: 't1', ...data } });

// T074 — las callable de equipo: solo el Propietario (FR-014), salvo aceptar una invitación.
describe('callable de equipo', () => {
  let h: ReturnType<typeof harness>;
  let team: ReturnType<typeof teamCallables>;

  beforeEach(() => {
    h = harness();
    h.t1.store.roles.set(OWNER_ROLE_ID, { ...createOwnerRole(T1, AT), memberCount: 1 });
    h.t1.store.roles.set(CATALOG_ROLE_ID, { ...createCatalogRole(T1, AT), memberCount: 1 });
    team = teamCallables(h.deps);
  });

  it('la Propietaria crea un rol, que nace sin permisos', async () => {
    const created = await team.createRole.run(asOwner({ name: 'Precios' }));
    if (!created.ok) throw new Error(JSON.stringify(created));
    expect(h.t1.store.roles.get(created.data.roleId)?.permissions).toEqual([]);
  });

  it('un permiso que no existe vuelve como invalid-argument', async () => {
    await expect(team.updateRole.run(asOwner({ roleId: 'catalog', permissions: ['config.secrets'] }))).resolves.toEqual(
      expect.objectContaining({ ok: false, code: 'invalid-argument' }),
    );
  });

  it('editar el rol Propietario se deniega como operación prohibida (contrato)', async () => {
    expect(await httpsErrorCode(team.updateRole.run(asOwner({ roleId: 'owner', name: 'Jefa' })))).toBe('permission-denied');
  });

  // El enlace lleva el comercio: quien acepta todavía no es miembro y no lo podría declarar verificado.
  it('invitar devuelve el enlace, y aceptar con él suma la membresía de ese comercio', async () => {
    const invited = await team.inviteCollaborator.run(asOwner({ email: 'nueva@correo.test', roleId: 'catalog' }));
    if (!invited.ok) throw new Error(JSON.stringify(invited));
    const accepted = await team.acceptInvitation.run(
      callRequest({ auth: { uid: 'nueva', name: 'Nueva', email: 'nueva@correo.test' }, data: { invitationToken: invited.data.token } }),
    );
    expect(accepted).toEqual({ ok: true, data: { tenantId: 't1', roleId: 'catalog' } });
    expect(h.t1.store.members.get(uid('nueva'))).toEqual(expect.objectContaining({ status: 'active', roleId: roleId('catalog') }));
  });

  it('un enlace mal formado no llega a ningún comercio', async () => {
    const malformed = callRequest({ auth: { uid: 'nueva', email: 'nueva@correo.test' }, data: { invitationToken: 'sin-barra' } });
    expect(await httpsErrorCode(team.acceptInvitation.run(malformed))).toBe('invalid-argument');
  });

  it('la baja y el traspaso pasan por el contrato con sus nombres de campo', async () => {
    await expect(team.setMembershipEnabled.run(asOwner({ uid: 'ana', enabled: false }))).resolves.toEqual({ ok: true, data: { status: 'disabled' } });
    await expect(team.setMembershipEnabled.run(asOwner({ uid: 'ana', enabled: true }))).resolves.toEqual({ ok: true, data: { status: 'active' } });
    await expect(team.transferOwnership.run(asOwner({ toUid: 'ana', newRoleIdForCurrentOwner: 'catalog' }))).resolves.toEqual({ ok: true, data: { ownerUid: 'ana' } });
  });

  it.each(['createRole', 'updateRole', 'deleteRole', 'inviteCollaborator', 'revokeInvitation', 'assignRole', 'setMembershipEnabled', 'transferOwnership'] as const)(
    '%s: un colaborador, aunque tenga permisos de catálogo, queda afuera (FR-014)',
    async (name) => {
      const asCollaborator = callRequest({ auth: { uid: 'ana' }, data: { tenantId: 't1' } });
      expect(await httpsErrorCode(team[name].run(asCollaborator))).toBe('permission-denied');
    },
  );
});

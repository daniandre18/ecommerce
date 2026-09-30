import {
  activateMembership,
  createCatalogRole,
  createCustomRole,
  disableMembership,
  inviteMembership,
  roleId,
  setRolePermissions,
  tenantId,
  uid,
  type Membership,
} from '@ecommerce/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { PermissionDeniedError } from '../ports/authorization';
import type { OperationContext } from '../ports/operation-context';
import { InMemoryUnitOfWork } from '../testing/in-memory';
import { RoleBasedAuthorizationService } from './authorization.service';

const T1 = tenantId('t1');
const AT = new Date('2026-09-30T12:00:00Z');
const ctx = (u: string): OperationContext => ({ tenantId: T1, actorUid: uid(u), actorName: u, requestId: 'r' });

function activeMember(u: string, role: string, isOwner = false): Membership {
  const m = activateMembership(
    inviteMembership({ uid: uid(u), tenantId: T1, roleId: roleId(role), displayName: u, email: `${u}@t1`, at: AT }),
    AT,
  );
  return isOwner ? { ...m, isOwner: true } : m;
}

describe('RoleBasedAuthorizationService', () => {
  let uow: InMemoryUnitOfWork;
  const authz = new RoleBasedAuthorizationService();
  const check = (u: string, p: Parameters<typeof authz.assert>[2]) =>
    uow.run((tx) => authz.assert(tx, ctx(u), p));

  beforeEach(() => {
    uow = new InMemoryUnitOfWork();
    const catalog = createCatalogRole(T1, AT);
    const pricing = setRolePermissions(createCustomRole(roleId('pricing'), T1, 'Precios', AT), ['catalog.read', 'variant.price.write']);
    const empty = createCustomRole(roleId('empty'), T1, 'Nuevo', AT);
    for (const r of [catalog, pricing, empty]) uow.store.roles.set(r.id, r);
    for (const m of [
      activeMember('owner', 'owner', true),
      activeMember('ana', 'catalog'),
      activeMember('beto', 'pricing'),
      activeMember('ciro', 'empty'),
      activeMember('dora', 'ghost'),
    ]) uow.store.members.set(m.uid, m);
  });

  it('el Propietario puede todo', async () => {
    await expect(check('owner', 'variant.cost.write')).resolves.toBeUndefined();
  });

  it('el rol concede lo que tiene', async () => {
    await expect(check('ana', 'catalog.write')).resolves.toBeUndefined();
    await expect(check('ana', 'variant.stock.write')).resolves.toBeUndefined();
  });

  it('el rol de Catálogo no modifica precios (FR-013, FR-016)', async () => {
    await expect(check('ana', 'variant.price.write')).rejects.toThrow(PermissionDeniedError);
  });

  it('el rol de Catálogo no ve ni edita el costo (FR-015, FR-016)', async () => {
    await expect(check('ana', 'variant.cost.read')).rejects.toThrow(PermissionDeniedError);
    await expect(check('ana', 'variant.cost.write')).rejects.toThrow(PermissionDeniedError);
  });

  it('precios y costo son independientes: modificar precios no da acceso al costo (FR-015)', async () => {
    await expect(check('beto', 'variant.price.write')).resolves.toBeUndefined();
    await expect(check('beto', 'variant.cost.read')).rejects.toThrow(PermissionDeniedError);
  });

  it('default-deny: un rol recién creado no concede nada (FR-009)', async () => {
    await expect(check('ciro', 'catalog.read')).rejects.toThrow(PermissionDeniedError);
  });

  it('un rol inexistente no concede nada', async () => {
    await expect(check('dora', 'catalog.read')).rejects.toThrow(PermissionDeniedError);
  });

  it('sin membresía en el comercio, nada', async () => {
    await expect(check('intruso', 'catalog.read')).rejects.toThrow(PermissionDeniedError);
  });

  it('una membresía dada de baja no opera, aunque su rol conceda (FR-008a)', async () => {
    uow.store.members.set(uid('ana'), disableMembership(uow.store.members.get(uid('ana'))!, AT));
    await expect(check('ana', 'catalog.write')).rejects.toThrow(PermissionDeniedError);
  });

  it('una invitación no aceptada no opera (FR-007)', async () => {
    const invited = inviteMembership({ uid: uid('eva'), tenantId: T1, roleId: roleId('catalog'), displayName: 'eva', email: 'e@t1', at: AT });
    uow.store.members.set(invited.uid, invited);
    await expect(check('eva', 'catalog.read')).rejects.toThrow(PermissionDeniedError);
  });

  it('retirar un permiso rige en la operación siguiente, sin tocar tokens (FR-008)', async () => {
    await expect(check('beto', 'variant.price.write')).resolves.toBeUndefined();
    const pricing = uow.store.roles.get(roleId('pricing'))!;
    uow.store.roles.set(pricing.id, setRolePermissions(pricing, ['catalog.read']));
    await expect(check('beto', 'variant.price.write')).rejects.toThrow(PermissionDeniedError);
  });

  describe('assertOwner', () => {
    it('admite al Propietario activo', async () => {
      await expect(uow.run((tx) => authz.assertOwner(tx, ctx('owner')))).resolves.toBeUndefined();
    });

    it('rechaza a cualquier otro rol, por más permisos que tenga', async () => {
      await expect(uow.run((tx) => authz.assertOwner(tx, ctx('beto')))).rejects.toThrow(PermissionDeniedError);
    });

    it('rechaza a un Propietario dado de baja', async () => {
      uow.store.members.set(uid('owner'), disableMembership(uow.store.members.get(uid('owner'))!, AT));
      await expect(uow.run((tx) => authz.assertOwner(tx, ctx('owner')))).rejects.toThrow(PermissionDeniedError);
    });
  });
});

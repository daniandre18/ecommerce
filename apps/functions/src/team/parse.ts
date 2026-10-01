import { invitationId, roleId, uid, type InvitationId, type RoleId, type Uid } from '@ecommerce/domain';
import { JsonObject } from '../bootstrap/json';

// Entradas de las callable de equipo (contracts/callable-functions.md). Como en catálogo, cada
// objeto se arma campo por campo; qué permisos existen lo decide el dominio.

export function parseCreateRole(data: unknown): { name: string; copyFrom?: RoleId } {
  const json = JsonObject.payload(data);
  return { name: json.string('name'), ...json.optional('copyFrom', (key) => json.id(key, roleId)) };
}

export function parseUpdateRole(data: unknown): { roleId: RoleId; name?: string; permissions?: string[] } {
  const json = JsonObject.payload(data);
  return {
    roleId: json.id('roleId', roleId),
    ...json.optional('name', (key) => json.string(key)),
    ...json.optional('permissions', (key) => json.strings(key)),
  };
}

export function parseDeleteRole(data: unknown): { roleId: RoleId } {
  return { roleId: JsonObject.payload(data).id('roleId', roleId) };
}

export function parseInviteCollaborator(data: unknown): { email: string; roleId: RoleId } {
  const json = JsonObject.payload(data);
  return { email: json.string('email'), roleId: json.id('roleId', roleId) };
}

export function parseRevokeInvitation(data: unknown): { invitationId: InvitationId } {
  return { invitationId: JsonObject.payload(data).id('invitationId', invitationId) };
}

/**
 * El enlace de invitación es `{tenantId}/{invitationId}`. Un id no puede contener `/`, así que la
 * separación no es ambigua. `undefined` si no tiene esa forma: la guarda lo rechaza por falta de
 * comercio, antes de cualquier lectura.
 */
export function invitationTokenParts(data: unknown): { tenantId: string; invitationId: string } | undefined {
  const token = (data as { invitationToken?: unknown } | null)?.invitationToken;
  if (typeof token !== 'string') return undefined;
  const [tenant, id, ...rest] = token.split('/');
  return tenant && id && rest.length === 0 ? { tenantId: tenant, invitationId: id } : undefined;
}

export function parseAcceptInvitation(data: unknown): { invitationId: InvitationId } {
  const parts = invitationTokenParts(data);
  const json = JsonObject.payload({ invitationId: parts?.invitationId });
  return { invitationId: json.id('invitationId', invitationId) };
}

export function parseAssignRole(data: unknown): { uid: Uid; roleId: RoleId } {
  const json = JsonObject.payload(data);
  return { uid: json.id('uid', uid), roleId: json.id('roleId', roleId) };
}

export function parseSetMembershipEnabled(data: unknown): { uid: Uid; enabled: boolean } {
  const json = JsonObject.payload(data);
  return { uid: json.id('uid', uid), enabled: json.boolean('enabled') };
}

export function parseTransferOwnership(data: unknown): { toUid: Uid; newRoleIdForCurrentOwner: RoleId } {
  const json = JsonObject.payload(data);
  return { toUid: json.id('toUid', uid), newRoleIdForCurrentOwner: json.id('newRoleIdForCurrentOwner', roleId) };
}

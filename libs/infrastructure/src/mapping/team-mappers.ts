import {
  invitationId,
  roleId,
  tenantId,
  uid,
  type Invitation,
  type InvitationStatus,
  type Membership,
  type MembershipStatus,
  type Permission,
  type Role,
} from '@ecommerce/domain';
import { toDate, toDateOrNull, type DocumentData } from './document';

export function membershipFromDoc(id: string, tid: string, d: DocumentData): Membership {
  return {
    uid: uid(id),
    tenantId: tenantId(tid),
    roleId: roleId(String(d['roleId'])),
    isOwner: d['isOwner'] === true,
    displayName: String(d['displayName'] ?? ''),
    email: String(d['email'] ?? ''),
    status: d['status'] as MembershipStatus,
    invitedAt: toDate(d['invitedAt']),
    activatedAt: toDateOrNull(d['activatedAt']),
    disabledAt: toDateOrNull(d['disabledAt']),
  };
}

/**
 * Campos persistidos, enumerados a propósito: un campo nuevo de `Membership` no llega a Firestore
 * hasta que alguien decide guardarlo. `tenantId` no se guarda porque está en la ruta; `uid` también
 * está, pero se guarda además para que una cuenta encuentre sus comercios con una consulta de grupo
 * filtrada por su uid (T075), que es lo único que las reglas le permiten listar.
 */
export function membershipToDoc(m: Membership): DocumentData {
  return {
    uid: m.uid,
    roleId: m.roleId,
    isOwner: m.isOwner,
    displayName: m.displayName,
    email: m.email,
    status: m.status,
    invitedAt: m.invitedAt,
    activatedAt: m.activatedAt,
    disabledAt: m.disabledAt,
  };
}

export function roleFromDoc(id: string, tid: string, d: DocumentData): Role {
  return {
    id: roleId(id),
    tenantId: tenantId(tid),
    name: String(d['name'] ?? ''),
    permissions: (d['permissions'] ?? []) as Permission[],
    preset: (d['preset'] ?? null) as Role['preset'],
    editable: d['editable'] !== false,
    memberCount: Number(d['memberCount'] ?? 0),
    createdAt: toDate(d['createdAt']),
  };
}

/** Campos persistidos, enumerados a propósito. `id` y `tenantId` están en la ruta. */
export function roleToDoc(r: Role): DocumentData {
  return {
    name: r.name,
    permissions: [...r.permissions],
    preset: r.preset,
    editable: r.editable,
    memberCount: r.memberCount,
    createdAt: r.createdAt,
  };
}

export function invitationFromDoc(id: string, tid: string, d: DocumentData): Invitation {
  return {
    id: invitationId(id),
    tenantId: tenantId(tid),
    email: String(d['email']),
    roleId: roleId(String(d['roleId'])),
    status: d['status'] as InvitationStatus,
    createdAt: toDate(d['createdAt']),
    expiresAt: toDate(d['expiresAt']),
    acceptedAt: toDateOrNull(d['acceptedAt']),
    createdBy: uid(String(d['createdBy'])),
  };
}

/** Campos persistidos, enumerados a propósito. `id` y `tenantId` están en la ruta. */
export function invitationToDoc(i: Invitation): DocumentData {
  return {
    email: i.email,
    roleId: i.roleId,
    status: i.status,
    createdAt: i.createdAt,
    expiresAt: i.expiresAt,
    acceptedAt: i.acceptedAt,
    createdBy: i.createdBy,
  };
}

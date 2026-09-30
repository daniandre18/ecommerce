import {
  roleId,
  tenantId,
  uid,
  type Membership,
  type MembershipStatus,
  type Permission,
  type Role,
} from '@ecommerce/domain';
import { Timestamp, type DocumentData } from 'firebase-admin/firestore';

export function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  throw new TypeError(`Se esperaba una marca de tiempo; se recibió ${String(value)}`);
}

export function toDateOrNull(value: unknown): Date | null {
  return value == null ? null : toDate(value);
}

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
 * hasta que alguien decide guardarlo. `uid` y `tenantId` no se guardan porque están en la ruta.
 */
export function membershipToDoc(m: Membership): DocumentData {
  return {
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

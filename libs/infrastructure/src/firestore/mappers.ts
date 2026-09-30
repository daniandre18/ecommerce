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

export function membershipToDoc(m: Membership): DocumentData {
  const { uid: _uid, tenantId: _tid, ...rest } = m;
  return rest;
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

export function roleToDoc(r: Role): DocumentData {
  const { id: _id, tenantId: _tid, ...rest } = r;
  return { ...rest, permissions: [...r.permissions] };
}

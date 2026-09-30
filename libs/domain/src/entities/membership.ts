import type { RoleId, TenantId, Uid } from '../value-objects/ids';

export type MembershipStatus = 'invited' | 'active' | 'disabled';

/**
 * Vínculo entre una cuenta y UN comercio. Una cuenta puede tener una membresía en cada comercio,
 * con rol y estado propios (FR-005). No hay transición a "eliminada": la baja es lógica (FR-008a).
 */
export interface Membership {
  readonly uid: Uid;
  readonly tenantId: TenantId;
  readonly roleId: RoleId;
  /** Denormalizado para que las reglas de Firestore no necesiten un segundo `get()`. */
  readonly isOwner: boolean;
  /** Se copia a la bitácora al momento del hecho (FR-031). */
  readonly displayName: string;
  readonly email: string;
  readonly status: MembershipStatus;
  readonly invitedAt: Date;
  readonly activatedAt: Date | null;
  readonly disabledAt: Date | null;
}

export class InvalidMembershipTransitionError extends Error {
  override readonly name = 'InvalidMembershipTransitionError';
}

export function inviteMembership(input: {
  uid: Uid;
  tenantId: TenantId;
  roleId: RoleId;
  displayName: string;
  email: string;
  at: Date;
}): Membership {
  return Object.freeze({
    uid: input.uid,
    tenantId: input.tenantId,
    roleId: input.roleId,
    isOwner: false,
    displayName: input.displayName,
    email: input.email,
    status: 'invited',
    invitedAt: input.at,
    activatedAt: null,
    disabledAt: null,
  });
}

export function isActive(membership: Membership): boolean {
  return membership.status === 'active';
}

function transition(
  membership: Membership,
  from: MembershipStatus,
  to: MembershipStatus,
  changes: Partial<Membership>,
): Membership {
  if (membership.status !== from) {
    throw new InvalidMembershipTransitionError(
      `No se puede pasar de '${membership.status}' a '${to}'`,
    );
  }
  return Object.freeze({ ...membership, ...changes, status: to });
}

export function activateMembership(membership: Membership, at: Date): Membership {
  return transition(membership, 'invited', 'active', { activatedAt: at });
}

export function disableMembership(membership: Membership, at: Date): Membership {
  return transition(membership, 'active', 'disabled', { disabledAt: at });
}

export function reactivateMembership(membership: Membership, at: Date): Membership {
  return transition(membership, 'disabled', 'active', { activatedAt: at, disabledAt: null });
}

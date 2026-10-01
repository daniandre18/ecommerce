import type { InvitationId, RoleId, TenantId, Uid } from '../value-objects/ids';

/** Caducidad de una invitación pendiente. */
export const INVITATION_TTL_DAYS = 14;
const TTL_MS = INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000;

/** `expired` se guarda solo cuando alguien intenta aceptarla tarde; vencida, también lo dice `isExpired`. */
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

/** Propuesta de membresía dirigida a un correo. No da ningún acceso hasta aceptarse (FR-007). */
export interface Invitation {
  readonly id: InvitationId;
  readonly tenantId: TenantId;
  /** Normalizado: minúsculas y sin espacios al borde. */
  readonly email: string;
  readonly roleId: RoleId;
  readonly status: InvitationStatus;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
  readonly createdBy: Uid;
}

export type InvitationRejection = 'invalid-email' | 'expired' | 'revoked' | 'accepted' | 'not-pending';

export class InvalidInvitationError extends Error {
  override readonly name = 'InvalidInvitationError';

  constructor(
    readonly reason: InvitationRejection,
    message: string,
  ) {
    super(message);
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createInvitation(input: {
  id: InvitationId;
  tenantId: TenantId;
  email: string;
  roleId: RoleId;
  createdBy: Uid;
  at: Date;
}): Invitation {
  const email = normalizeEmail(input.email);
  if (!EMAIL.test(email)) throw new InvalidInvitationError('invalid-email', `Correo inválido: ${JSON.stringify(input.email)}`);
  return Object.freeze({
    id: input.id,
    tenantId: input.tenantId,
    email,
    roleId: input.roleId,
    status: 'pending',
    createdAt: input.at,
    expiresAt: new Date(input.at.getTime() + TTL_MS),
    acceptedAt: null,
    createdBy: input.createdBy,
  });
}

export function isExpired(invitation: Invitation, now: Date): boolean {
  return invitation.status === 'expired' || (invitation.status === 'pending' && now.getTime() >= invitation.expiresAt.getTime());
}

export function acceptInvitation(invitation: Invitation, at: Date): Invitation {
  if (invitation.status === 'revoked') throw new InvalidInvitationError('revoked', 'La invitación fue revocada');
  if (invitation.status === 'accepted') throw new InvalidInvitationError('accepted', 'La invitación ya fue aceptada');
  if (isExpired(invitation, at)) throw new InvalidInvitationError('expired', 'La invitación venció');
  return Object.freeze({ ...invitation, status: 'accepted', acceptedAt: at });
}

/** Reenviar: vuelve a estar pendiente, con caducidad nueva desde ahora y el rol que se indique. */
export function renewInvitation(invitation: Invitation, roleId: RoleId, at: Date): Invitation {
  if (invitation.status === 'accepted') throw new InvalidInvitationError('accepted', 'La invitación ya fue aceptada');
  return Object.freeze({ ...invitation, roleId, status: 'pending', expiresAt: new Date(at.getTime() + TTL_MS) });
}

export function revokeInvitation(invitation: Invitation): Invitation {
  if (invitation.status === 'accepted') throw new InvalidInvitationError('accepted', 'Una invitación aceptada no se revoca: se da de baja la membresía');
  if (invitation.status === 'revoked') return invitation;
  return Object.freeze({ ...invitation, status: 'revoked' });
}

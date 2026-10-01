import {
  acceptInvitation,
  activateMembership,
  createInvitation,
  InvalidInvitationError,
  invitationId,
  inviteMembership,
  isActive,
  normalizeEmail,
  reactivateMembership,
  renewInvitation,
  revokeInvitation,
  type InvitationId,
  type Membership,
  type RoleId,
} from '@ecommerce/domain';
import { BusinessRuleError } from '../../errors';
import { requireAccount, requireOwner } from '../../ports/authorization';
import type { OperationContext } from '../../ports/operation-context';
import type { TransactionScope } from '../../ports/unit-of-work';
import type { UseCaseDependencies } from '../shared';
import { assertAssignable, loadRole, recordTeamChange, withMemberCount } from './team-shared';

/** El enlace que recibe la persona invitada: el comercio y un id que nadie puede adivinar. */
const tokenOf = (tenantId: string, id: string) => `${tenantId}/${id}`;

async function loadInvitation(tx: TransactionScope, id: InvitationId) {
  const invitation = await tx.invitations.findById(id);
  if (!invitation) throw new BusinessRuleError('not-found', 'No existe esa invitación');
  return invitation;
}

/** Traslada el rechazo del dominio al código del contrato, conservando el motivo. */
function invitationRule<T>(build: () => T): T {
  try {
    return build();
  } catch (error) {
    if (error instanceof InvalidInvitationError) throw new BusinessRuleError('invalid-argument', error.message, { reason: error.reason });
    throw error;
  }
}

/**
 * Sin tope de cantidad (FR-006). Invitar de nuevo al mismo correo reenvía la pendiente en vez de
 * duplicarla (FR-007). A quien ya es miembro activo de este comercio no se lo invita.
 */
export class InviteCollaborator {
  static readonly requires = requireOwner();

  constructor(private readonly deps: UseCaseDependencies) {}

  async execute(
    tx: TransactionScope,
    ctx: OperationContext,
    input: { readonly email: string; readonly roleId: RoleId },
  ): Promise<{ invitationId: InvitationId; token: string }> {
    const email = normalizeEmail(input.email);
    const role = await loadRole(tx, input.roleId);
    const member = await tx.members.findByEmail(email);
    const pending = await tx.invitations.findPendingByEmail(email);

    assertAssignable(role);
    if (member && member.status !== 'disabled') throw new BusinessRuleError('invalid-argument', `${email} ya es miembro de este comercio`);

    const now = this.deps.clock.now();
    const invitation = invitationRule(() =>
      pending
        ? renewInvitation(pending, role.id, now)
        : createInvitation({ id: invitationId(this.deps.ids.next()), tenantId: ctx.tenantId, email, roleId: role.id, createdBy: ctx.actorUid, at: now }),
    );
    await tx.invitations.save(invitation);
    await recordTeamChange(tx, ctx, this.deps, {
      change: 'invitation.sent',
      entity: { kind: 'invitation', id: invitation.id },
      before: null,
      after: { email, roleId: role.id, roleName: role.name, status: invitation.status },
    });
    return { invitationId: invitation.id, token: tokenOf(ctx.tenantId, invitation.id) };
  }
}

export class RevokeInvitation {
  static readonly requires = requireOwner();

  constructor(private readonly deps: UseCaseDependencies) {}

  async execute(tx: TransactionScope, ctx: OperationContext, input: { readonly invitationId: InvitationId }): Promise<Record<string, never>> {
    const invitation = await loadInvitation(tx, input.invitationId);
    const revoked = invitationRule(() => revokeInvitation(invitation));
    if (revoked === invitation) return {};
    await tx.invitations.save(revoked);
    await recordTeamChange(tx, ctx, this.deps, {
      change: 'invitation.revoked',
      entity: { kind: 'invitation', id: invitation.id },
      before: { email: invitation.email, status: invitation.status },
      after: { email: invitation.email, status: revoked.status },
    });
    return {};
  }
}

/**
 * Quien acepta todavía no es miembro: alcanza con la sesión, y la invitación tiene que ser para su
 * correo. Se le suma una membresía de este comercio; su cuenta y sus otras membresías no cambian
 * (FR-005). Quien había sido dado de baja vuelve, con el rol de la invitación.
 */
export class AcceptInvitation {
  static readonly requires = requireAccount();

  constructor(private readonly deps: UseCaseDependencies) {}

  async execute(tx: TransactionScope, ctx: OperationContext, input: { readonly invitationId: InvitationId }): Promise<{ tenantId: string; roleId: RoleId }> {
    const invitation = await loadInvitation(tx, input.invitationId);
    const existing = await tx.members.findByUid(ctx.actorUid);
    const role = await loadRole(tx, invitation.roleId);
    const previousRole = existing && existing.roleId !== role.id ? await tx.roles.findById(existing.roleId) : null;

    if (normalizeEmail(ctx.actorEmail ?? '') !== invitation.email) {
      throw new BusinessRuleError('invalid-argument', 'Esta invitación es para otro correo', { reason: 'email-mismatch' });
    }
    if (existing && isActive(existing)) {
      throw new BusinessRuleError('invalid-argument', 'Ya sos miembro de este comercio', { reason: 'already-member' });
    }

    const now = this.deps.clock.now();
    const accepted = invitationRule(() => acceptInvitation(invitation, now));
    const membership: Membership = existing
      ? { ...reactivateMembership(existing, now), roleId: role.id }
      : activateMembership(
          inviteMembership({ uid: ctx.actorUid, tenantId: ctx.tenantId, roleId: role.id, displayName: ctx.actorName, email: invitation.email, at: invitation.createdAt }),
          now,
        );

    await tx.invitations.save(accepted);
    await tx.members.save(membership);
    await tx.roles.save(withMemberCount(role, existing?.roleId === role.id ? 0 : 1));
    if (previousRole) await tx.roles.save(withMemberCount(previousRole, -1));
    await recordTeamChange(tx, ctx, this.deps, {
      change: 'membership.added',
      entity: { kind: 'membership', id: ctx.actorUid },
      before: existing ? { roleId: existing.roleId, status: existing.status } : null,
      after: { email: invitation.email, roleId: role.id, roleName: role.name, status: membership.status },
    });
    return { tenantId: ctx.tenantId, roleId: role.id };
  }
}

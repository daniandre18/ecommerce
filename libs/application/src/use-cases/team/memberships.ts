import {
  disableMembership,
  OWNER_ROLE_ID,
  reactivateMembership,
  type Membership,
  type RoleId,
  type Uid,
} from '@ecommerce/domain';
import { BusinessRuleError } from '../../errors';
import { requireOwner } from '../../ports/authorization';
import type { OperationContext } from '../../ports/operation-context';
import type { TransactionScope } from '../../ports/unit-of-work';
import { loadTenant, type UseCaseDependencies } from '../shared';
import { assertAssignable, loadMember, loadRole, recordTeamChange, withMemberCount } from './team-shared';

function assertNotOwner(member: Membership, what: string): void {
  if (member.isOwner) throw new BusinessRuleError('invalid-argument', `${what}: para eso se traspasa la propiedad`);
}

/** Rige en la operación siguiente del colaborador, con sesión ya iniciada (FR-008). */
export class AssignRole {
  static readonly requires = requireOwner();

  constructor(private readonly deps: UseCaseDependencies) {}

  async execute(tx: TransactionScope, ctx: OperationContext, input: { readonly uid: Uid; readonly roleId: RoleId }): Promise<Record<string, never>> {
    const member = await loadMember(tx, input.uid);
    const next = await loadRole(tx, input.roleId);
    const previous = await loadRole(tx, member.roleId);

    assertNotOwner(member, 'El rol de la Propietaria no se cambia');
    assertAssignable(next);
    if (previous.id === next.id) return {};

    await tx.members.save({ ...member, roleId: next.id });
    await tx.roles.save(withMemberCount(previous, -1));
    await tx.roles.save(withMemberCount(next, 1));
    await recordTeamChange(tx, ctx, this.deps, {
      change: 'role.assigned',
      entity: { kind: 'membership', id: member.uid },
      before: { roleId: previous.id, roleName: previous.name },
      after: { roleId: next.id, roleName: next.name },
    });
    return {};
  }
}

/**
 * Baja lógica de la membresía en ESTE comercio (FR-008a): ni la cuenta ni sus otras membresías
 * cambian, y la membresía no se borra porque la bitácora la nombra. El corte es inmediato: las
 * reglas leen la membresía en cada solicitud.
 */
export class SetMembershipEnabled {
  static readonly requires = requireOwner();

  constructor(private readonly deps: UseCaseDependencies) {}

  async execute(tx: TransactionScope, ctx: OperationContext, input: { readonly uid: Uid; readonly enabled: boolean }): Promise<{ status: Membership['status'] }> {
    const member = await loadMember(tx, input.uid);
    assertNotOwner(member, 'A la Propietaria no se la da de baja');
    if ((member.status === 'active') === input.enabled) return { status: member.status };
    if (member.status === 'invited') throw new BusinessRuleError('invalid-argument', 'La membresía todavía no fue aceptada');

    const now = this.deps.clock.now();
    const updated = input.enabled ? reactivateMembership(member, now) : disableMembership(member, now);
    await tx.members.save(updated);
    await recordTeamChange(tx, ctx, this.deps, {
      change: input.enabled ? 'membership.reactivated' : 'membership.disabled',
      entity: { kind: 'membership', id: member.uid },
      before: { status: member.status },
      after: { status: updated.status },
    });
    return { status: updated.status };
  }
}

/**
 * Exactamente un Propietario antes y después (FR-011): en una sola transacción cambian el comercio,
 * las dos membresías y los contadores de rol. Como la propiedad se lee de la membresía y no de un
 * token, rige de inmediato.
 */
export class TransferOwnership {
  static readonly requires = requireOwner();

  constructor(private readonly deps: UseCaseDependencies) {}

  async execute(
    tx: TransactionScope,
    ctx: OperationContext,
    input: { readonly toUid: Uid; readonly newRoleIdForCurrentOwner: RoleId },
  ): Promise<{ ownerUid: Uid }> {
    const tenant = await loadTenant(tx);
    const current = await loadMember(tx, ctx.actorUid);
    const target = await loadMember(tx, input.toUid);
    const nextRole = await loadRole(tx, input.newRoleIdForCurrentOwner);
    const targetRole = await loadRole(tx, target.roleId);

    if (target.uid === current.uid) throw new BusinessRuleError('invalid-argument', 'La propiedad ya es tuya');
    if (target.status !== 'active') throw new BusinessRuleError('invalid-argument', 'Solo se traspasa a una membresía activa');
    assertAssignable(nextRole);

    await tx.tenant.save({ ...tenant, ownerUid: target.uid });
    await tx.members.save({ ...target, isOwner: true, roleId: OWNER_ROLE_ID });
    await tx.members.save({ ...current, isOwner: false, roleId: nextRole.id });
    // El rol Propietario sigue con una sola persona: entra una y sale otra. Se mueven los demás.
    if (targetRole.id !== nextRole.id) {
      await tx.roles.save(withMemberCount(targetRole, -1));
      await tx.roles.save(withMemberCount(nextRole, 1));
    }
    await recordTeamChange(tx, ctx, this.deps, {
      change: 'ownership.transferred',
      entity: { kind: 'tenant', id: ctx.tenantId },
      before: { uid: current.uid, isOwner: true },
      after: { uid: target.uid, isOwner: true },
    });
    return { ownerUid: target.uid };
  }
}

import {
  buildTeamAuditEntry,
  OWNER_ROLE_ID,
  type AuditEntryId,
  type Membership,
  type Role,
  type RoleId,
  type RoleSnapshot,
  type TeamChange,
  type Uid,
} from '@ecommerce/domain';
import { BusinessRuleError } from '../../errors';
import type { OperationContext } from '../../ports/operation-context';
import type { TransactionScope } from '../../ports/unit-of-work';
import { actorOf, type UseCaseDependencies } from '../shared';

/** Todo cambio de equipo deja su entrada, en la misma transacción que el cambio (FR-031a, FR-033). */
export async function recordTeamChange(tx: TransactionScope, ctx: OperationContext, deps: UseCaseDependencies, change: TeamChange): Promise<void> {
  await tx.audit.append([buildTeamAuditEntry(actorOf(ctx), change, { at: deps.clock.now(), id: deps.ids.next() as AuditEntryId })]);
}

export async function loadRole(tx: TransactionScope, id: RoleId): Promise<Role> {
  const role = await tx.roles.findById(id);
  if (!role) throw new BusinessRuleError('not-found', `No existe el rol ${id}`);
  return role;
}

export async function loadMember(tx: TransactionScope, uid: Uid): Promise<Membership> {
  const member = await tx.members.findByUid(uid);
  if (!member) throw new BusinessRuleError('not-found', `${uid} no es miembro de este comercio`);
  return member;
}

/** El rol Propietario no se asigna: la propiedad solo cambia de manos con un traspaso (FR-011). */
export function assertAssignable(role: Role): void {
  if (role.id === OWNER_ROLE_ID) {
    throw new BusinessRuleError('invalid-argument', 'El rol Propietario no se asigna: se traspasa la propiedad');
  }
}

export const roleSnapshot = (role: Role): RoleSnapshot => ({ roleId: role.id, roleName: role.name, permissions: [...role.permissions] });

export const withMemberCount = (role: Role, delta: number): Role => ({ ...role, memberCount: Math.max(0, role.memberCount + delta) });

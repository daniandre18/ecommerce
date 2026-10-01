import {
  canDeleteRole,
  createCustomRole,
  normalizeName,
  roleId,
  setRolePermissions,
  UnknownPermissionError,
  type Role,
  type RoleId,
} from '@ecommerce/domain';
import { BusinessRuleError } from '../../errors';
import { PermissionDeniedError, requireOwner } from '../../ports/authorization';
import type { OperationContext } from '../../ports/operation-context';
import type { TransactionScope } from '../../ports/unit-of-work';
import type { UseCaseDependencies } from '../shared';
import { loadRole, recordTeamChange, roleSnapshot } from './team-shared';

function roleName(raw: string, existing: readonly Role[], except?: RoleId): string {
  const name = raw.trim();
  if (name === '') throw new BusinessRuleError('invalid-argument', 'El rol necesita un nombre');
  if (existing.some((role) => role.id !== except && normalizeName(role.name) === normalizeName(name))) {
    throw new BusinessRuleError('invalid-argument', `Ya hay un rol llamado «${name}»`);
  }
  return name;
}

/** Un rol propio nace sin permisos (FR-009); duplicar uno copia los suyos (FR-013). */
export class CreateRole {
  static readonly requires = requireOwner();

  constructor(private readonly deps: UseCaseDependencies) {}

  async execute(tx: TransactionScope, ctx: OperationContext, input: { readonly name: string; readonly copyFrom?: RoleId }): Promise<{ roleId: RoleId }> {
    const existing = await tx.roles.list();
    const source = input.copyFrom === undefined ? undefined : await loadRole(tx, input.copyFrom);
    if (source && !source.editable) throw new BusinessRuleError('invalid-argument', 'El rol Propietario no se duplica');

    const created = createCustomRole(roleId(this.deps.ids.next()), ctx.tenantId, roleName(input.name, existing), this.deps.clock.now());
    const role = source ? { ...created, permissions: [...source.permissions] } : created;
    await tx.roles.save(role);
    await recordTeamChange(tx, ctx, this.deps, { change: 'role.created', entity: { kind: 'role', id: role.id }, before: null, after: roleSnapshot(role) });
    return { roleId: role.id };
  }
}

/** Nombre y permisos. Rige en la operación siguiente de cada miembro, sin tocar tokens (FR-008). */
export class UpdateRole {
  static readonly requires = requireOwner();

  constructor(private readonly deps: UseCaseDependencies) {}

  async execute(
    tx: TransactionScope,
    ctx: OperationContext,
    input: { readonly roleId: RoleId; readonly name?: string; readonly permissions?: readonly unknown[] },
  ): Promise<Record<string, never>> {
    const existing = await tx.roles.list();
    const role = await loadRole(tx, input.roleId);
    // Contrato: editar el rol Propietario es una operación prohibida, no un dato inválido (FR-016).
    if (!role.editable) throw new PermissionDeniedError('El rol Propietario no se edita');

    let updated: Role = input.name === undefined ? role : { ...role, name: roleName(input.name, existing, role.id) };
    if (input.permissions !== undefined) updated = withPermissions(updated, input.permissions);
    await tx.roles.save(updated);
    await recordTeamChange(tx, ctx, this.deps, { change: 'role.updated', entity: { kind: 'role', id: role.id }, before: roleSnapshot(role), after: roleSnapshot(updated) });
    return {};
  }
}

/** No se borra con colaboradores asignados (FR-013), ni el Propietario (FR-016). */
export class DeleteRole {
  static readonly requires = requireOwner();

  constructor(private readonly deps: UseCaseDependencies) {}

  async execute(tx: TransactionScope, ctx: OperationContext, input: { readonly roleId: RoleId }): Promise<Record<string, never>> {
    const role = await loadRole(tx, input.roleId);
    if (!role.editable) throw new BusinessRuleError('invalid-argument', 'El rol Propietario no se elimina');
    if (!canDeleteRole(role)) {
      throw new BusinessRuleError('invalid-argument', `Reasigná antes a sus ${role.memberCount} colaboradores`, { memberCount: role.memberCount });
    }
    await tx.roles.delete(role.id);
    await recordTeamChange(tx, ctx, this.deps, { change: 'role.deleted', entity: { kind: 'role', id: role.id }, before: roleSnapshot(role), after: null });
    return {};
  }
}

function withPermissions(role: Role, permissions: readonly unknown[]): Role {
  try {
    return setRolePermissions(role, permissions);
  } catch (error) {
    if (error instanceof UnknownPermissionError) throw new BusinessRuleError('invalid-argument', error.message);
    throw error;
  }
}

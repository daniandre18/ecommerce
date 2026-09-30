import type { RoleId, TenantId } from '../value-objects/ids';
import { isPermission, type Permission } from '../value-objects/permission';

export interface Role {
  readonly id: RoleId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly permissions: readonly Permission[];
  /** null = definido por el comercio. */
  readonly preset: 'owner' | 'catalog' | null;
  /** false para 'owner' (FR-016). */
  readonly editable: boolean;
  /** Se mantiene al asignar y desasignar, para bloquear el borrado sin consultar (FR-013). */
  readonly memberCount: number;
  readonly createdAt: Date;
}

/** Rol predefinido de Catálogo: sin precios y sin costo (FR-016). */
export const PRESET_CATALOG_PERMISSIONS: readonly Permission[] = Object.freeze([
  'catalog.read',
  'catalog.write',
  'variant.stock.write',
]);

export class RoleNotEditableError extends Error {
  override readonly name = 'RoleNotEditableError';
}

export class UnknownPermissionError extends Error {
  override readonly name = 'UnknownPermissionError';
}

/** Un rol propio nace sin ningún permiso (FR-009). */
export function createCustomRole(id: RoleId, tenantId: TenantId, name: string, at: Date): Role {
  return Object.freeze({
    id,
    tenantId,
    name,
    permissions: Object.freeze([]),
    preset: null,
    editable: true,
    memberCount: 0,
    createdAt: at,
  });
}

/**
 * Recibe `unknown[]` a propósito: el valor llega de afuera y se valida contra el enumerado.
 * Un permiso inexistente se rechaza en lugar de descartarse en silencio (FR-012).
 */
export function setRolePermissions(role: Role, permissions: readonly unknown[]): Role {
  if (!role.editable) {
    throw new RoleNotEditableError(`El rol ${role.id} no es editable`);
  }
  const unknown = permissions.filter((p) => !isPermission(p));
  if (unknown.length > 0) {
    throw new UnknownPermissionError(`Permisos inexistentes: ${JSON.stringify(unknown)}`);
  }
  const unique = [...new Set(permissions as Permission[])];
  return Object.freeze({ ...role, permissions: Object.freeze(unique) });
}

export function canDeleteRole(role: Role): boolean {
  return role.editable && role.memberCount === 0;
}

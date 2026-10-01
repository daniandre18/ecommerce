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

export const OWNER_ROLE_ID = 'owner' as RoleId;
export const CATALOG_ROLE_ID = 'catalog' as RoleId;

/**
 * Rol del sistema: da acceso total por `Membership.isOwner`, no por su lista de permisos, que queda
 * vacía. No se edita ni se elimina (FR-016).
 */
export function createOwnerRole(tenantId: TenantId, at: Date): Role {
  return Object.freeze({
    id: OWNER_ROLE_ID,
    tenantId,
    name: 'Propietario',
    permissions: Object.freeze([]),
    preset: 'owner',
    editable: false,
    memberCount: 0,
    createdAt: at,
  });
}

/** Plantilla predefinida de Catálogo: usable tal cual o ajustable, sin precios ni costo (FR-016). */
export function createCatalogRole(tenantId: TenantId, at: Date): Role {
  return Object.freeze({
    id: CATALOG_ROLE_ID,
    tenantId,
    name: 'Catálogo',
    permissions: PRESET_CATALOG_PERMISSIONS,
    preset: 'catalog',
    editable: true,
    memberCount: 0,
    createdAt: at,
  });
}

/**
 * Los roles con los que nace todo comercio (T070): Propietario, indeleble y no editable, y Catálogo
 * con exactamente sus tres permisos, sin precios y sin costo (FR-016).
 */
export function presetRoles(tenantId: TenantId, at: Date): readonly Role[] {
  return [createOwnerRole(tenantId, at), createCatalogRole(tenantId, at)];
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

export class RoleNotDeletableError extends Error {
  override readonly name = 'RoleNotDeletableError';
}

/** El Propietario no se elimina (FR-016), y un rol con miembros tampoco (FR-013). */
export function canDeleteRole(role: Role): boolean {
  return role.editable && role.memberCount === 0;
}

export function assertCanDeleteRole(role: Role): void {
  if (!role.editable) {
    throw new RoleNotDeletableError(`El rol ${role.id} es del sistema y no se elimina`);
  }
  if (role.memberCount > 0) {
    throw new RoleNotDeletableError(
      `El rol ${role.id} tiene ${role.memberCount} miembros asignados; hay que reasignarlos antes`,
    );
  }
}

import { describe, expect, it } from 'vitest';
import { roleId, tenantId } from '../value-objects/ids';
import {
  canDeleteRole,
  createCustomRole,
  PRESET_CATALOG_PERMISSIONS,
  RoleNotEditableError,
  setRolePermissions,
  UnknownPermissionError,
} from './role';

const T1 = tenantId('t1');
const NOW = new Date('2026-09-30T12:00:00Z');

describe('Role', () => {
  it('un rol propio nace sin ningún permiso (FR-009)', () => {
    const role = createCustomRole(roleId('r1'), T1, 'Bodega', NOW);
    expect(role.permissions).toEqual([]);
    expect(role.preset).toBeNull();
    expect(role.editable).toBe(true);
    expect(role.memberCount).toBe(0);
  });

  it('concede permisos del enumerado', () => {
    const role = createCustomRole(roleId('r1'), T1, 'Bodega', NOW);
    const updated = setRolePermissions(role, ['catalog.read', 'variant.stock.write']);
    expect(updated.permissions).toEqual(['catalog.read', 'variant.stock.write']);
  });

  it('rechaza un permiso que no existe: el comercio no puede inventarlos (FR-012)', () => {
    const role = createCustomRole(roleId('r1'), T1, 'Bodega', NOW);
    expect(() => setRolePermissions(role, ['catalog.read', 'config.secrets.read'])).toThrow(
      UnknownPermissionError,
    );
  });

  it('deduplica permisos repetidos', () => {
    const role = createCustomRole(roleId('r1'), T1, 'Bodega', NOW);
    expect(setRolePermissions(role, ['catalog.read', 'catalog.read']).permissions).toEqual([
      'catalog.read',
    ]);
  });

  it('el rol de Propietario no se edita (FR-016)', () => {
    const owner = { ...createCustomRole(roleId('owner'), T1, 'Propietario', NOW), preset: 'owner' as const, editable: false };
    expect(() => setRolePermissions(owner, ['catalog.read'])).toThrow(RoleNotEditableError);
  });

  it('no se elimina un rol con miembros asignados (FR-013)', () => {
    const role = { ...createCustomRole(roleId('r1'), T1, 'Bodega', NOW), memberCount: 3 };
    expect(canDeleteRole(role)).toBe(false);
    expect(canDeleteRole({ ...role, memberCount: 0 })).toBe(true);
  });

  it('el Propietario no se elimina aunque no tenga miembros contados', () => {
    const owner = { ...createCustomRole(roleId('owner'), T1, 'Propietario', NOW), preset: 'owner' as const, editable: false };
    expect(canDeleteRole(owner)).toBe(false);
  });

  it('el rol predefinido de Catálogo no incluye precios ni costo (FR-016)', () => {
    expect(PRESET_CATALOG_PERMISSIONS).toEqual(['catalog.read', 'catalog.write', 'variant.stock.write']);
    expect(PRESET_CATALOG_PERMISSIONS).not.toContain('variant.price.write');
    expect(PRESET_CATALOG_PERMISSIONS).not.toContain('variant.cost.read');
  });
});

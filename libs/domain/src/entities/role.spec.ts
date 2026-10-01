import { describe, expect, it } from 'vitest';
import { roleId, tenantId } from '../value-objects/ids';
import {
  assertCanDeleteRole,
  canDeleteRole,
  createCatalogRole,
  createCustomRole,
  createOwnerRole,
  PRESET_CATALOG_PERMISSIONS,
  presetRoles,
  RoleNotDeletableError,
  RoleNotEditableError,
  setRolePermissions,
  UnknownPermissionError,
} from './role';

const T1 = tenantId('t1');
const NOW = new Date('2026-09-30T12:00:00Z');
const customRole = () => createCustomRole(roleId('r1'), T1, 'Bodega', NOW);

describe('Role', () => {
  it('un rol propio nace sin ningún permiso (FR-009)', () => {
    const role = customRole();
    expect(role.permissions).toEqual([]);
    expect(role.preset).toBeNull();
    expect(role.editable).toBe(true);
    expect(role.memberCount).toBe(0);
  });

  it('concede permisos del enumerado', () => {
    const updated = setRolePermissions(customRole(), ['catalog.read', 'variant.stock.write']);
    expect(updated.permissions).toEqual(['catalog.read', 'variant.stock.write']);
  });

  it('rechaza un permiso que no existe: el comercio no puede inventarlos (FR-012)', () => {
    expect(() => setRolePermissions(customRole(), ['catalog.read', 'config.secrets.read'])).toThrow(
      UnknownPermissionError,
    );
  });

  it('deduplica permisos repetidos', () => {
    expect(setRolePermissions(customRole(), ['catalog.read', 'catalog.read']).permissions).toEqual([
      'catalog.read',
    ]);
  });

  it('no se elimina un rol con miembros asignados (FR-013)', () => {
    const role = { ...customRole(), memberCount: 3 };
    expect(canDeleteRole(role)).toBe(false);
    expect(canDeleteRole({ ...role, memberCount: 0 })).toBe(true);
  });

  it('assertCanDeleteRole explica por qué no se puede borrar', () => {
    expect(() => assertCanDeleteRole({ ...customRole(), memberCount: 1 })).toThrow(RoleNotDeletableError);
    expect(() => assertCanDeleteRole(createOwnerRole(T1, NOW))).toThrow(RoleNotDeletableError);
    expect(() => assertCanDeleteRole(customRole())).not.toThrow();
  });

  describe('rol de Propietario', () => {
    it('no se edita (FR-016)', () => {
      expect(() => setRolePermissions(createOwnerRole(T1, NOW), ['catalog.read'])).toThrow(
        RoleNotEditableError,
      );
    });

    it('no se elimina aunque no tenga miembros contados (FR-016)', () => {
      expect(canDeleteRole(createOwnerRole(T1, NOW))).toBe(false);
    });

    it('no depende de su lista de permisos: el acceso total sale de la membresía', () => {
      expect(createOwnerRole(T1, NOW).permissions).toEqual([]);
    });
  });

  describe('rol predefinido de Catálogo', () => {
    it('no incluye precios ni costo (FR-016)', () => {
      const catalog = createCatalogRole(T1, NOW);
      expect(catalog.permissions).toEqual(PRESET_CATALOG_PERMISSIONS);
      expect(catalog.permissions).not.toContain('variant.price.write');
      expect(catalog.permissions).not.toContain('variant.cost.read');
      expect(catalog.permissions).not.toContain('variant.cost.write');
    });

    it('se puede ajustar: es una plantilla, no un rol del sistema', () => {
      const adjusted = setRolePermissions(createCatalogRole(T1, NOW), ['catalog.read']);
      expect(adjusted.permissions).toEqual(['catalog.read']);
    });
  });
});

// T070 — todo comercio nace con Propietario y Catálogo, y nada más.
describe('presetRoles', () => {
  it('Propietario no editable ni eliminable; Catálogo con exactamente sus tres permisos (FR-016)', () => {
    const [owner, catalog, ...rest] = presetRoles(tenantId('t1'), new Date('2026-09-30T12:00:00Z'));
    expect(rest).toEqual([]);
    expect(owner).toEqual(expect.objectContaining({ id: 'owner', editable: false, permissions: [] }));
    expect(owner && canDeleteRole(owner)).toBe(false);
    expect(catalog).toEqual(expect.objectContaining({ id: 'catalog', editable: true, permissions: ['catalog.read', 'catalog.write', 'variant.stock.write'] }));
  });
});

import { describe, expect, it } from 'vitest';
import { allows, isPermission, PERMISSIONS } from './permission';

// T019 — el enumerado es la reserva constitucional hecha tipo (FR-014, principio VI).
describe('Permission', () => {
  it('contiene exactamente los permisos concedibles', () => {
    expect([...PERMISSIONS].sort()).toEqual(
      [
        'audit.read',
        'catalog.read',
        'catalog.write',
        'team.read',
        'variant.cost.read',
        'variant.cost.write',
        'variant.price.write',
        'variant.stock.write',
      ].sort(),
    );
  });

  // Si alguien agrega un permiso sobre secretos, facturación o administración de equipo,
  // esta prueba falla: esos permisos son del Propietario y no pueden existir como concesión.
  it.each([/secret/i, /credential/i, /billing/i, /factur/i, /team\.write/i, /role/i, /owner/i])(
    'no contiene ningún permiso reservado al Propietario (%s)',
    (pattern) => {
      expect(PERMISSIONS.filter((p) => pattern.test(p))).toEqual([]);
    },
  );

  it('precios y costo son permisos independientes (FR-015)', () => {
    expect(PERMISSIONS).toContain('variant.price.write');
    expect(PERMISSIONS).toContain('variant.cost.read');
    expect(PERMISSIONS).toContain('variant.cost.write');
  });

  it('valida cadenas externas contra el enumerado (FR-012)', () => {
    expect(isPermission('catalog.write')).toBe(true);
    expect(isPermission('config.secrets.read')).toBe(false);
    expect(isPermission('')).toBe(false);
    expect(isPermission(42)).toBe(false);
  });
});

describe('allows', () => {
  it('el Propietario puede todo, aunque su rol no conceda nada', () => {
    expect(allows({ isOwner: true, permissions: [] }, 'variant.cost.write')).toBe(true);
  });

  it('el resto, solo lo que concede su rol', () => {
    const catalog = { isOwner: false, permissions: ['catalog.read', 'catalog.write'] as const };
    expect(allows(catalog, 'catalog.write')).toBe(true);
    expect(allows(catalog, 'variant.price.write')).toBe(false);
  });
});

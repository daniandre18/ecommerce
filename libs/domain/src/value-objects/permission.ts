/**
 * Permisos concedibles a un rol. Los permisos sobre credenciales de pasarelas, facturación de la
 * suscripción y administración de equipo, roles y permisos NO están acá a propósito (FR-014):
 * pertenecen solo al Propietario y no pueden concederse porque no existen como concesión.
 */
export const PERMISSIONS = [
  'catalog.read',
  'catalog.write',
  'variant.stock.write',
  'variant.price.write', // precio de venta y comparativo, independiente del costo (FR-015)
  'variant.cost.read',
  'variant.cost.write',
  'audit.read',
  'team.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS);

/** Valida un valor que llega de afuera. El comercio no puede inventar permisos (FR-012). */
export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && PERMISSION_SET.has(value);
}

import type { Permission } from '@ecommerce/domain';

export interface PermissionLabel {
  readonly label: string;
  readonly hint: string;
}

/**
 * Cómo se presenta cada permiso concedible (T077). Es un `Record` sobre el enumerado: si el dominio
 * suma un permiso, esto no compila hasta darle nombre. Las credenciales de pago, la facturación y la
 * administración del equipo no están porque no existen como concesión (FR-014).
 */
export const PERMISSION_LABELS: Readonly<Record<Permission, PermissionLabel>> = {
  'catalog.read': { label: 'Ver el catálogo', hint: 'Productos, variantes e imágenes.' },
  'catalog.write': { label: 'Editar el catálogo', hint: 'Crear y editar productos, opciones, SKU e imágenes, y archivar.' },
  'variant.stock.write': { label: 'Cambiar existencias', hint: 'Queda anotado en la bitácora.' },
  'variant.price.write': { label: 'Cambiar precios', hint: 'Precio de venta y precio tachado. Queda anotado en la bitácora.' },
  'variant.cost.read': { label: 'Ver el costo', hint: 'Costo de adquisición de cada variante.' },
  'variant.cost.write': { label: 'Cambiar el costo', hint: 'Queda anotado en la bitácora.' },
  'audit.read': { label: 'Ver la bitácora', hint: 'Quién cambió qué y cuándo.' },
  'team.read': { label: 'Ver el equipo', hint: 'Quiénes forman parte del comercio y con qué rol.' },
};

/** El orden de presentación: de lo más común a lo más delicado. */
export const PERMISSION_GROUPS: readonly { readonly heading: string; readonly permissions: readonly Permission[] }[] = [
  { heading: 'Catálogo', permissions: ['catalog.read', 'catalog.write', 'variant.stock.write'] },
  { heading: 'Precios y costo', permissions: ['variant.price.write', 'variant.cost.read', 'variant.cost.write'] },
  { heading: 'Consultas', permissions: ['audit.read', 'team.read'] },
];

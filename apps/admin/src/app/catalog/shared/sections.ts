import type { Product, SectionId } from '@ecommerce/domain';

/** Los nombres de las dos secciones de la plataforma en la interfaz (FR-027). */
export const SECTION_LABELS: Record<SectionId, string> = { featured: 'Destacados', offers: 'Ofertas' };

/**
 * El rechazo por sección completa, con los lugares que quedan (FR-027b): "Ofertas no tiene lugar
 * para los 2: queda 1 lugar. No se agregó ninguno."
 */
export function sectionFullMessage(details: unknown): string {
  const { section, remaining = 0, requested = 1 } = (details ?? {}) as { section?: SectionId; remaining?: number; requested?: number };
  const name = section ? SECTION_LABELS[section] : 'La sección';
  const left = remaining === 1 ? 'queda 1 lugar' : `quedan ${remaining}`;
  if (requested === 1) return `${name} no tiene lugar: ${left}.`;
  return `${name} no tiene lugar para los ${requested}: ${left === 'queda 1 lugar' ? left : `${left} lugares`}. No se agregó ninguno.`;
}

/** Por qué la tienda no mostraría un producto que está en una sección, o `null` si lo muestra. */
export function unseenReason(product: Pick<Product, 'status'>): string | null {
  if (product.status === 'draft') return 'en borrador';
  if (product.status === 'unlisted') return 'no listado';
  return null;
}

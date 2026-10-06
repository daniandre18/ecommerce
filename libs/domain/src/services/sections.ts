import type { ProductId } from '../value-objects/ids';

/** Las dos secciones destacadas, fijadas por la plataforma (FR-027): "Destacados" y "Ofertas". */
export const SECTION_IDS = ['featured', 'offers'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** Tope por sección, contando todos los productos que figuran sea cual sea su estado (FR-027a). */
export const MAX_SECTION_PRODUCTS = 40;

/**
 * Las secciones de un comercio, en un solo documento (research §4 de la 002). La lista es el
 * contador: no hay un número aparte que pueda desfasarse, y el tope se verifica sobre lo mismo que
 * se escribe.
 */
export type FeaturedSections = Readonly<Record<SectionId, readonly ProductId[]>>;

export const emptySections = (): FeaturedSections => ({ featured: [], offers: [] });

/** No hay lugar para todos: se informa cuántos quedan, y no se agrega ninguno (FR-027b). */
export class SectionFullError extends Error {
  override readonly name = 'SectionFullError';

  constructor(
    readonly remaining: number,
    readonly requested: number,
  ) {
    super(`Quedan ${remaining} lugares y se pidieron ${requested}`);
  }
}

/**
 * Agrega al final los que no estaban, en el orden pedido. Los que ya estaban no cuentan dos veces.
 * Si no hay lugar para todos los nuevos, lanza `SectionFullError` sin cambiar nada: nunca quita ni
 * desplaza a otro para hacer lugar.
 */
export function addToSection(list: readonly ProductId[], ids: readonly ProductId[]): ProductId[] {
  const present = new Set(list);
  const added = [...new Set(ids)].filter((id) => !present.has(id));
  const remaining = MAX_SECTION_PRODUCTS - list.length;
  if (added.length > remaining) throw new SectionFullError(Math.max(0, remaining), added.length);
  return [...list, ...added];
}

/** Saca los que están, conservando el orden del resto; los que no están se ignoran. */
export function removeFromSection(list: readonly ProductId[], ids: readonly ProductId[]): ProductId[] {
  const removed = new Set(ids);
  return list.filter((id) => !removed.has(id));
}

/**
 * Las secciones sin un producto (archivarlo, FR-028). Si no figuraba en ninguna devuelve las mismas
 * secciones: quien llama sabe así que no hay nada que escribir.
 */
export function withoutProduct(sections: FeaturedSections, id: ProductId): FeaturedSections {
  if (!sections.featured.includes(id) && !sections.offers.includes(id)) return sections;
  return { featured: removeFromSection(sections.featured, [id]), offers: removeFromSection(sections.offers, [id]) };
}

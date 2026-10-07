import { emptySections, productId, type FeaturedSections } from '@ecommerce/domain';
import type { DocumentData } from './document';

// `storefront/sections`: Destacados y Ofertas, cada una la lista de sus productos (research §4 de la
// 002). La lista es el contador del tope: no hay otro campo que mantener.

export function sectionsFromDoc(d: DocumentData | undefined): FeaturedSections {
  if (!d) return emptySections();
  const list = (value: unknown) => ((value ?? []) as unknown[]).map((id) => productId(String(id)));
  return { featured: list(d['featured']), offers: list(d['offers']) };
}

export function sectionsToDoc(sections: FeaturedSections): Record<string, unknown> {
  return { featured: [...sections.featured], offers: [...sections.offers] };
}

import {
  fallbackSlug,
  nextSlugCandidate,
  slugify,
  suffixedSlug,
  type Product,
  type ProductId,
  type Slug,
} from '@ecommerce/domain';
import { BusinessRuleError } from '../../errors';
import type { IdGenerator } from '../../ports/system';
import type { TransactionScope } from '../../ports/unit-of-work';

/** Candidatos que se prueban antes de recurrir a un sufijo aleatorio (research §5 de la 002). */
const MAX_SLUG_CANDIDATES = 20;

/** La URL que corresponde a un nombre, o la de respaldo si el nombre no produce ninguna (FR-006). */
export function slugBaseFor(name: string, id: ProductId): { base: Slug; needsReplacement: boolean } {
  const fromName = slugify(name);
  return fromName ? { base: fromName, needsReplacement: false } : { base: fallbackSlug(id), needsReplacement: true };
}

/**
 * La primera URL libre a partir de una base: la base, o el menor sufijo libre (FR-006). Una reservada
 * por el mismo producto cuenta como libre: es suya. Solo lee, así que va antes de cualquier
 * escritura de la transacción. La reserva, al confirmar, es la que resuelve una carrera.
 */
export async function freeSlug(tx: TransactionScope, base: Slug, owner: ProductId, ids: IdGenerator): Promise<Slug> {
  for (let n = 1; n <= MAX_SLUG_CANDIDATES; n++) {
    const candidate = nextSlugCandidate(base, n);
    const entry = await tx.slugIndex.find(candidate);
    if (!entry || entry.productId === owner) return candidate;
  }
  return suffixedSlug(base, ids.next().slice(0, 8));
}

/**
 * Cambia la URL vigente de un producto en el índice. La anterior se libera si el producto nunca se
 * publicó —nadie la enlazó— y queda reservada como anterior si sí (FR-008). La nueva se reserva, o
 * vuelve a ser vigente si era una anterior suya. Solo escribe: lo que lee va antes.
 */
export async function moveSlug(
  tx: TransactionScope,
  product: Pick<Product, 'slug' | 'publishedOnce'>,
  next: Slug,
  nextIsOwnPrevious: boolean,
  owner: ProductId,
): Promise<void> {
  if (product.slug === next) return;
  if (product.slug) {
    if (product.publishedOnce) await tx.slugIndex.markPrevious(product.slug);
    else await tx.slugIndex.release(product.slug);
  }
  if (nextIsOwnPrevious) await tx.slugIndex.markCurrent(next);
  else await tx.slugIndex.reserve(next, owner);
}

/** Un texto opcional con tope: vacío es `null` (FR-009, FR-012, FR-031). */
export function optionalText(value: string | null, max: number, field: string): string | null {
  const text = value?.trim() ?? '';
  if (text === '') return null;
  if (text.length > max) {
    throw new BusinessRuleError('invalid-argument', `${field} admite hasta ${max} caracteres`, { field, max, actual: text.length });
  }
  return text;
}

/** Peso o dimensión: entero mayor que cero (FR-014). */
export function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BusinessRuleError('invalid-argument', `${field} debe ser un entero mayor que cero`, { field, value });
  }
  return value;
}

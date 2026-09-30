import type { ProductStatus } from '../entities/product';
import { isVariantComplete, type Variant } from '../entities/variant';
import type { VariantId } from '../value-objects/ids';
import { err, ok, type Result } from '../result';

export type StatusChangeRejected =
  | { readonly kind: 'incomplete-variants'; readonly variantIds: readonly VariantId[] }
  | { readonly kind: 'no-variants' };

/**
 * Pasar a `active` o `unlisted` exige que todas las variantes en circulación estén completas, y dice
 * cuáles lo impiden (FR-023a). `draft` siempre se permite.
 *
 * No recibe el producto a propósito: la regla mira las variantes, que son la fuente de verdad, y no
 * el campo de caché `hasIncompleteVariants`. Y el archivado del producto no interviene, porque es
 * ortogonal al estado.
 */
export function canChangeStatus(variants: readonly Variant[], target: ProductStatus): Result<void, StatusChangeRejected> {
  if (target === 'draft') return ok(undefined);

  const inCirculation = variants.filter((variant) => !variant.archived);
  if (inCirculation.length === 0) return err({ kind: 'no-variants' });

  const incomplete = inCirculation.filter((variant) => !isVariantComplete(variant)).map((variant) => variant.id);
  return incomplete.length > 0 ? err({ kind: 'incomplete-variants', variantIds: incomplete }) : ok(undefined);
}

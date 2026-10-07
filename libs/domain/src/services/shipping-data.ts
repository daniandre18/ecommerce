import type { Dimensions, Product } from '../entities/product';
import type { Variant } from '../entities/variant';

export type ProductShippingSource = Pick<Product, 'kind' | 'weightGrams' | 'dimensionsMm'>;
export type VariantShippingSource = Pick<Variant, 'weightGrams' | 'dimensionsMm' | 'archived'>;

/** Un valor efectivo y de dónde sale: lo que la tabla de variantes muestra (FR-015). */
export interface Effective<T> {
  readonly value: T | null;
  readonly origin: 'own' | 'inherited';
}

export interface EffectiveShipping {
  readonly weightGrams: Effective<number>;
  readonly dimensionsMm: Effective<Dimensions>;
}

const pick = <T>(own: T | null, inherited: T | null): Effective<T> =>
  own === null ? { value: inherited, origin: 'inherited' } : { value: own, origin: 'own' };

/**
 * Peso y dimensiones de una variante: los suyos si los tiene, si no los del producto. Se heredan
 * por separado: una variante puede tener peso propio y heredar las dimensiones (FR-015).
 */
export function effectiveShipping(product: ProductShippingSource, variant: VariantShippingSource): EffectiveShipping {
  return {
    weightGrams: pick(variant.weightGrams, product.weightGrams),
    dimensionsMm: pick(variant.dimensionsMm, product.dimensionsMm),
  };
}

/**
 * "Faltan datos de envío" (FR-017): un físico con alguna variante en circulación sin peso o sin
 * dimensiones efectivos. Un digital nunca, porque no se envía. Es una marca del listado: nunca
 * impide un cambio de estado.
 */
export function missingShippingData(product: ProductShippingSource, variants: readonly VariantShippingSource[]): boolean {
  if (product.kind === 'digital') return false;
  return variants
    .filter((variant) => !variant.archived)
    .some((variant) => {
      const effective = effectiveShipping(product, variant);
      return effective.weightGrams.value === null || effective.dimensionsMm.value === null;
    });
}

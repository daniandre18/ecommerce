import type { VariationOption } from '../entities/product';
import type { Combination } from '../entities/variant';

export const byPosition = <T extends { readonly position: number }>(a: T, b: T) => a.position - b.position;

/**
 * Producto cartesiano de los valores de las opciones, en el orden en que se muestran (FR-018).
 * Sin opciones devuelve `[{}]`: una sola combinación, la de la variante implícita (FR-020).
 */
export function generateCombinations(options: readonly VariationOption[]): Combination[] {
  return [...options].sort(byPosition).reduce<Combination[]>(
    (combinations, option) =>
      combinations.flatMap((partial) =>
        [...option.values].sort(byPosition).map((value) => ({ ...partial, [option.id]: value.id })),
      ),
    [{}],
  );
}

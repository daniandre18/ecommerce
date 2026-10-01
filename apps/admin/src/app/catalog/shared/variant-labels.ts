import { byPosition, type Combination, type Variant, type VariationOption } from '@ecommerce/domain';

/** "Rojo / S", en el orden de las opciones. La variante implícita de un producto sin opciones es "Única". */
export function combinationLabel(options: readonly VariationOption[], combination: Combination): string {
  const labels = [...options].sort(byPosition).map((option) => {
    const valueId = combination[option.id];
    return option.values.find((value) => value.id === valueId)?.label ?? '—';
  });
  return labels.length === 0 ? 'Única' : labels.join(' / ');
}

/** Las variantes en el orden de la tabla: el de sus opciones y, dentro de cada una, el de sus valores. */
export function sortVariants(options: readonly VariationOption[], variants: readonly Variant[]): Variant[] {
  const ordered = [...options].sort(byPosition);
  const rank = (variant: Variant) =>
    ordered.map((option) => option.values.find((value) => value.id === variant.optionValues[option.id])?.position ?? Infinity);
  return [...variants].sort((a, b) => {
    const [rankA, rankB] = [rank(a), rank(b)];
    const index = rankA.findIndex((position, i) => position !== rankB[i]);
    return index === -1 ? 0 : (rankA[index] ?? 0) - (rankB[index] ?? 0);
  });
}

import { createIncompleteVariant, optionId, productId, tenantId, valueId, variantId, type VariationOption } from '@ecommerce/domain';
import { combinationLabel, sortVariants } from './variant-labels';

const option = (id: string, position: number, labels: string[]): VariationOption => ({
  id: optionId(id),
  name: id,
  position,
  values: labels.map((label, index) => ({ id: valueId(`${id}-${label}`), label, position: index })),
});

const size = option('talla', 1, ['S', 'M']);
const color = option('color', 0, ['Rojo', 'Azul']);
const variant = (id: string, colorLabel: string, sizeLabel: string) =>
  createIncompleteVariant({
    id: variantId(id),
    tenantId: tenantId('t1'),
    productId: productId('p1'),
    optionValues: { [color.id]: valueId(`color-${colorLabel}`), [size.id]: valueId(`talla-${sizeLabel}`) },
  });

describe('etiquetas y orden de las variantes', () => {
  it('nombra la combinación en el orden de las opciones, no en el de sus claves', () => {
    expect(combinationLabel([size, color], variant('v', 'Azul', 'M').optionValues)).toBe('Azul / M');
  });

  it('la variante implícita de un producto sin opciones es "Única"', () => {
    expect(combinationLabel([], {})).toBe('Única');
  });

  it('ordena por la primera opción y después por la siguiente, según la posición de sus valores', () => {
    const sorted = sortVariants([size, color], [variant('a', 'Azul', 'M'), variant('b', 'Rojo', 'M'), variant('c', 'Rojo', 'S'), variant('d', 'Azul', 'S')]);
    expect(sorted.map((v) => v.id)).toEqual(['c', 'b', 'd', 'a']);
  });
});

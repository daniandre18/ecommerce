import { describe, expect, it } from 'vitest';
import { combo, option } from '../testing/builders';
import { generateCombinations } from './generate-combinations';

// T032 — base de FR-018: la tabla de variantes es el producto cartesiano de los valores.
describe('generateCombinations', () => {
  it('sin opciones hay exactamente una combinación: la variante implícita (FR-020)', () => {
    expect(generateCombinations([])).toEqual([{}]);
  });

  it('con una opción, una combinación por valor', () => {
    expect(generateCombinations([option('color', ['Rojo', 'Amarillo'])])).toEqual([
      combo({ color: 'Rojo' }),
      combo({ color: 'Amarillo' }),
    ]);
  });

  it('con varias opciones, el producto cartesiano completo', () => {
    const result = generateCombinations([option('color', ['Rojo', 'Amarillo'], 0), option('size', ['S', 'M', 'L'], 1)]);
    expect(result).toHaveLength(6);
    expect(result).toContainEqual(combo({ color: 'Amarillo', size: 'L' }));
  });

  it('el orden sigue la posición de opciones y valores, no el orden del arreglo', () => {
    const size = option('size', ['S', 'M']);
    const reversed = { ...size, values: size.values.map((value) => ({ ...value, position: 1 - value.position })) };
    expect(generateCombinations([reversed])).toEqual([combo({ size: 'M' }), combo({ size: 'S' })]);
  });

  it('no repite combinaciones', () => {
    const result = generateCombinations([option('color', ['Rojo', 'Azul']), option('size', ['S', 'M'], 1)]);
    expect(new Set(result.map((c) => JSON.stringify(c))).size).toBe(result.length);
  });
});

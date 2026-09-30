import { describe, expect, it } from 'vitest';
import { option } from '../testing/builders';
import { validateOptionStructure } from './validate-option-structure';

// T033a — FR-022: sin valores ni opciones repetidas, ignorando mayúsculas y espacios al borde.
describe('validateOptionStructure', () => {
  it('acepta una estructura válida', () => {
    expect(validateOptionStructure([option('color', ['Rojo', 'Azul']), option('size', ['S'], 1)]).ok).toBe(true);
  });

  it.each([
    ['la misma etiqueta', ['Rojo', 'Rojo'], 'Rojo'],
    ['distinta capitalización', ['Rojo', 'rojo'], 'rojo'],
    ['espacios al borde', ['Rojo', ' Rojo '], 'Rojo'],
  ])('rechaza valores repetidos dentro de una opción: %s', (_label, values, reported) => {
    expect(validateOptionStructure([option('color', values)])).toEqual({
      ok: false,
      error: { kind: 'duplicate-value', option: 'color', label: reported },
    });
  });

  it('trata como iguales las formas compuesta y descompuesta de un acento', () => {
    const composed = 'Caf\u00e9'; // é precompuesta (NFC)
    const decomposed = 'Cafe\u0301'; // e + acento combinante (NFD)
    expect(validateOptionStructure([option('sabor', [composed, decomposed])]).ok).toBe(false);
  });

  it('acepta el mismo valor en opciones distintas: "S" puede ser talla y también otra cosa', () => {
    expect(validateOptionStructure([option('size', ['S']), option('fit', ['S'], 1)]).ok).toBe(true);
  });

  it('rechaza dos opciones con el mismo nombre en el producto', () => {
    const colorA = option('color', ['Rojo']);
    const colorB = { ...option('Color', ['Azul'], 1), id: option('color2', []).id };
    expect(validateOptionStructure([colorA, colorB])).toEqual({
      ok: false,
      error: { kind: 'duplicate-option', name: 'Color' },
    });
  });

  // Sin valores, el producto cartesiano da cero variantes: el producto quedaría sin ninguna (FR-020).
  it('rechaza una opción sin valores', () => {
    expect(validateOptionStructure([option('color', [])])).toEqual({
      ok: false,
      error: { kind: 'option-without-values', option: 'color' },
    });
  });

  it('rechaza nombres de opción y etiquetas vacíos', () => {
    expect(validateOptionStructure([option('  ', ['a'])]).ok).toBe(false);
    expect(validateOptionStructure([option('color', ['  '])]).ok).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { option } from '../testing/builders';
import { validateOptionLimits } from './validate-option-limits';

const labels = (n: number) => Array.from({ length: n }, (_, i) => `v${i}`);

// T033 — FR-025: máximo 5 atributos de variación y 100 combinaciones, antes de crear nada.
describe('validateOptionLimits', () => {
  it('acepta hasta 5 opciones', () => {
    const five = Array.from({ length: 5 }, (_, i) => option(`o${i}`, ['a'], i));
    expect(validateOptionLimits(five)).toEqual({ ok: true, value: undefined });
  });

  it('rechaza la sexta opción', () => {
    const six = Array.from({ length: 6 }, (_, i) => option(`o${i}`, ['a'], i));
    expect(validateOptionLimits(six)).toEqual({
      ok: false,
      error: { kind: 'too-many-options', max: 5, actual: 6 },
    });
  });

  it('acepta exactamente 100 combinaciones', () => {
    expect(validateOptionLimits([option('a', labels(10)), option('b', labels(10), 1)]).ok).toBe(true);
  });

  it('rechaza 101 o más e informa cuántas produciría', () => {
    const result = validateOptionLimits([option('a', labels(11)), option('b', labels(10), 1)]);
    expect(result).toEqual({ ok: false, error: { kind: 'too-many-combinations', max: 100, actual: 110 } });
  });

  it('informa la cifra real aunque sea enorme, sin desbordar', () => {
    const huge = Array.from({ length: 5 }, (_, i) => option(`o${i}`, labels(50), i));
    expect(validateOptionLimits(huge)).toEqual({
      ok: false,
      error: { kind: 'too-many-combinations', max: 100, actual: 50 ** 5 },
    });
  });

  it('sin opciones hay una sola combinación: la variante implícita', () => {
    expect(validateOptionLimits([]).ok).toBe(true);
  });
});

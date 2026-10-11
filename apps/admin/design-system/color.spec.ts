import { describe, expect, it } from 'vitest';
import { contrastRatio, parseColor, round2 } from './color';

// La fórmula de WCAG 2.2 (luminancia relativa y razón de contraste), con valores de referencia conocidos.
describe('color', () => {
  it('negro sobre blanco da 21 y un color contra sí mismo da 1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
    expect(contrastRatio('#3c5afe', '#3c5afe')).toBe(1);
  });

  it('reproduce las razones de la referencia que research §2 cita', () => {
    expect(round2(contrastRatio('#536DFE', '#ffffff'))).toBe(4.21);
    expect(round2(contrastRatio('#ffc260', '#4A4A4A'))).toBe(5.54);
    expect(round2(contrastRatio('#3c5afe', '#f6f7ff'))).toBe(4.81);
  });

  it('entiende hex corto y largo, rgb() y rgba() con y sin comas, y transparent', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#00000080').a).toBeCloseTo(0.502, 3);
    expect(parseColor('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(parseColor('rgb(10 20 30 / 0.25)')).toEqual({ r: 10, g: 20, b: 30, a: 0.25 });
    expect(parseColor('transparent').a).toBe(0);
  });

  it('un texto con alfa se compone sobre su fondo antes de calcular', () => {
    // Negro al 50 % sobre blanco es el gris 127,5: lo que ve la persona.
    expect(round2(contrastRatio('rgba(0, 0, 0, 0.5)', '#ffffff'))).toBe(round2(contrastRatio('rgb(127.5, 127.5, 127.5)', '#ffffff')));
    expect(round2(contrastRatio('rgba(0, 0, 0, 0.5)', '#ffffff'))).not.toBe(round2(contrastRatio('#000000', '#ffffff')));
  });

  it('un fondo con alfa no se puede evaluar solo: necesita su plano', () => {
    expect(() => contrastRatio('#000000', 'rgba(255, 255, 255, 0.5)')).toThrow(/fondo/);
  });

  it('rechaza lo que no es un color', () => {
    expect(() => parseColor('4px')).toThrow(/4px/);
  });
});

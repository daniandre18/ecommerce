import { describe, expect, it } from 'vitest';
import { gtin, GTIN_LENGTHS, InvalidGtinError } from './gtin';

/** El motivo con que se rechaza, o `undefined` si se acepta. */
function rejection(raw: string): string | undefined {
  try {
    gtin(raw);
    return undefined;
  } catch (error) {
    if (error instanceof InvalidGtinError) return error.reason;
    throw error;
  }
}

// T083 — Historia 4, FR-030 y SC-005: el GTIN se valida con el dígito de control GS1 (módulo 10 con
// pesos 3 y 1) y se compara normalizado a 14 dígitos. Vectores verificados aparte con el algoritmo.
describe('Gtin', () => {
  it('admite 8, 12, 13 o 14 dígitos', () => {
    expect(GTIN_LENGTHS).toEqual([8, 12, 13, 14]);
  });

  it.each([
    ['EAN-8', '96385074'],
    ['UPC-A', '036000291452'],
    ['EAN-13', '4006381333931'],
    ['EAN-13', '5901234123457'],
    // Dígito de control 0: el caso en que la suma ya es múltiplo de 10.
    ['ISBN-13', '9783161484100'],
    ['GTIN-14', '10012345678902'],
  ])('acepta un %s válido: %s', (_kind, raw) => {
    expect(gtin(raw).raw).toBe(raw);
  });

  it('se normaliza a 14 dígitos con ceros a la izquierda', () => {
    expect(gtin('96385074').normalized).toBe('00000096385074');
    expect(gtin('4006381333931').normalized).toBe('04006381333931');
    expect(gtin('10012345678902').normalized).toBe('10012345678902');
  });

  it('un EAN-13 y el mismo con un cero delante son el mismo código', () => {
    expect(gtin('04006381333931').normalized).toBe(gtin('4006381333931').normalized);
  });

  it('un UPC-A de 12 y su forma de 13 con cero inicial también', () => {
    expect(gtin('0036000291452').normalized).toBe(gtin('036000291452').normalized);
    expect(gtin('00036000291452').normalized).toBe(gtin('036000291452').normalized);
  });

  it.each([
    ['EAN-13', '4006381333932'],
    ['GTIN-14', '40063813339310'],
    ['UPC-A', '400638133393'],
  ])('rechaza un %s con el dígito de control mal: %s', (_kind, raw) => {
    expect(rejection(raw)).toBe('check-digit');
  });

  it.each(['', '1234567', '123456789', '12345678901', '123456789012345'])('rechaza otra longitud: %j', (raw) => {
    expect(rejection(raw)).toBe('length');
  });

  it.each(['4006381333a31', '4006-381333931', '+4006381333931'])('rechaza lo que no son dígitos: %j', (raw) => {
    expect(rejection(raw)).toBe('digits');
  });

  it('ignora los espacios al borde, como al escribirlo', () => {
    expect(gtin(' 4006381333931 ')).toEqual({ raw: '4006381333931', normalized: '04006381333931' });
  });

  it('es un valor congelado', () => {
    expect(Object.isFrozen(gtin('96385074'))).toBe(true);
  });
});

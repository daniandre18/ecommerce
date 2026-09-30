import { describe, expect, it } from 'vitest';
import { InvalidSkuError, normalizarSku } from './sku';

// T013 — la unicidad de SKU se evalúa sobre la forma normalizada (FR-021).
describe('normalizarSku', () => {
  it('pasa a mayúsculas y quita espacios al borde', () => {
    expect(normalizarSku('  abc-1  ').normalized).toBe('ABC-1');
  });

  it('hace colisionar variantes de escritura del mismo código', () => {
    const forms = ['abc-1', 'ABC-1', ' Abc-1', 'aBc-1 '];
    const normalized = new Set(forms.map((f) => normalizarSku(f).normalized));
    expect(normalized.size).toBe(1);
  });

  it('conserva aparte la forma original que escribió la persona', () => {
    const sku = normalizarSku('  Camiseta-Roja-S ');
    expect(sku.raw).toBe('Camiseta-Roja-S');
    expect(sku.normalized).toBe('CAMISETA-ROJA-S');
  });

  it('no altera los espacios internos: son parte del código', () => {
    expect(normalizarSku('ab c').normalized).toBe('AB C');
  });

  it.each(['', '   ', '\t\n'])('rechaza un SKU vacío %j', (raw) => {
    expect(() => normalizarSku(raw)).toThrow(InvalidSkuError);
  });

  it('rechaza "/" porque el SKU normalizado es el id de un documento', () => {
    expect(() => normalizarSku('ABC/1')).toThrow(InvalidSkuError);
  });

  it.each(['.', '..'])('rechaza %j, reservado como id de documento', (raw) => {
    expect(() => normalizarSku(raw)).toThrow(InvalidSkuError);
  });
});

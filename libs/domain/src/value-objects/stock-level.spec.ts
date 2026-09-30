import { describe, expect, it } from 'vitest';
import {
  InvalidStockError,
  isStockDefined,
  stockEquals,
  stockQuantity,
  stockUndefined,
} from './stock-level';

// T014 — "sin existencias definidas" y "existencias en cero" son estados distintos (FR-029).
describe('StockLevel', () => {
  it('distingue sin definir de cero', () => {
    expect(stockEquals(stockUndefined(), stockQuantity(0))).toBe(false);
  });

  it('una variante recién generada no tiene existencias definidas', () => {
    expect(isStockDefined(stockUndefined())).toBe(false);
  });

  it('cero es una cantidad definida', () => {
    expect(isStockDefined(stockQuantity(0))).toBe(true);
  });

  it('compara por valor', () => {
    expect(stockEquals(stockQuantity(5), stockQuantity(5))).toBe(true);
    expect(stockEquals(stockUndefined(), stockUndefined())).toBe(true);
    expect(stockEquals(stockQuantity(5), stockQuantity(6))).toBe(false);
  });

  it.each([-1, 1.5, Number.NaN])('rechaza la cantidad %s', (value) => {
    expect(() => stockQuantity(value)).toThrow(InvalidStockError);
  });
});

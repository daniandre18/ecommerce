/**
 * Existencias de una variante. "Sin definir" y "cero" son estados distintos (FR-029):
 * una variante recién generada no tiene existencias cargadas, que no es lo mismo que agotada.
 */
export type StockLevel =
  | { readonly kind: 'undefined' }
  | { readonly kind: 'quantity'; readonly value: number };

export class InvalidStockError extends Error {
  override readonly name = 'InvalidStockError';
}

const UNDEFINED_STOCK: StockLevel = Object.freeze({ kind: 'undefined' });

export function stockUndefined(): StockLevel {
  return UNDEFINED_STOCK;
}

export function stockQuantity(value: number): StockLevel {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidStockError(`La cantidad debe ser un entero no negativo; se recibió ${value}`);
  }
  return Object.freeze({ kind: 'quantity', value });
}

export function isStockDefined(stock: StockLevel): boolean {
  return stock.kind === 'quantity';
}

export function stockEquals(a: StockLevel, b: StockLevel): boolean {
  if (a.kind === 'undefined' || b.kind === 'undefined') {
    return a.kind === b.kind;
  }
  return a.value === b.value;
}

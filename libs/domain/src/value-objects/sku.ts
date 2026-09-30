/**
 * Un SKU conserva la forma que escribió la persona y, aparte, la forma normalizada sobre la que
 * se evalúa la unicidad por inquilino (FR-021). La normalizada es además el id del documento de
 * `skuIndex`, por eso excluye lo que Firestore no admite como id.
 */
export interface Sku {
  readonly raw: string;
  readonly normalized: string;
}

export class InvalidSkuError extends Error {
  override readonly name = 'InvalidSkuError';
}

export function normalizeSku(input: string): Sku {
  const raw = input.trim();
  if (raw === '') {
    throw new InvalidSkuError('El SKU no puede estar vacío');
  }
  if (raw.includes('/')) {
    throw new InvalidSkuError(`El SKU no puede contener "/": ${JSON.stringify(raw)}`);
  }
  if (raw === '.' || raw === '..') {
    throw new InvalidSkuError(`SKU reservado: ${JSON.stringify(raw)}`);
  }
  return Object.freeze({ raw, normalized: raw.toUpperCase() });
}

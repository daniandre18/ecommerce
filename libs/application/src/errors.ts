/** Códigos del contrato de las callable (`contracts/callable-functions.md`). */
export type BusinessErrorCode =
  | 'not-found'
  | 'version-conflict' // FR-027
  | 'sku-conflict' // FR-021
  | 'limit-exceeded' // FR-025
  | 'incomplete-variants' // FR-023a
  | 'invalid-argument'
  // 002-storefront-catalog
  | 'slug-conflict' // FR-007: la URL está en uso o reservada
  | 'gtin-conflict' // FR-030
  | 'invalid-gtin' // FR-030
  | 'unsupported-video' // FR-018
  | 'category-limit' // FR-019: profundidad, ciclo o tope de categorías
  | 'category-name-taken' // FR-020
  | 'category-has-children' // FR-024
  | 'section-full' // FR-027b
  | 'digital-products'; // FR-029

/**
 * Una regla de negocio impidió la operación. Se lanza ANTES de cualquier escritura, así que la
 * transacción se revierte entera y no queda nada aplicado a medias. La callable devuelve el código
 * tal cual en su respuesta `{ ok: false, code, details }`.
 */
export class BusinessRuleError extends Error {
  override readonly name = 'BusinessRuleError';

  constructor(
    readonly code: BusinessErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

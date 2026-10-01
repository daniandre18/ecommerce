/** Códigos del contrato de las callable (`contracts/callable-functions.md`). */
export type BusinessErrorCode =
  | 'not-found'
  | 'version-conflict' // FR-027
  | 'sku-conflict' // FR-021
  | 'limit-exceeded' // FR-025
  | 'incomplete-variants' // FR-023a
  | 'invalid-argument';

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

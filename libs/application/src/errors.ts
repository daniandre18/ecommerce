import type { BusinessErrorCode } from '@ecommerce/application/client';

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

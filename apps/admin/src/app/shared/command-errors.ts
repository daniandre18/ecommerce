import type { CommandErrorCode } from '@ecommerce/application';

/**
 * Qué se le dice a la persona por cada código del contrato (`contracts/callable-functions.md`).
 * El mensaje técnico del servidor no se muestra: puede nombrar campos internos.
 */
const MESSAGES: Record<CommandErrorCode, string> = {
  'not-found': 'No encontramos lo que buscabas. Puede que lo hayan archivado.',
  'version-conflict': 'Alguien más lo editó mientras lo tenías abierto. Recargá para ver los cambios.',
  'sku-conflict': 'Ese SKU ya lo usa otra variante.',
  'limit-exceeded': 'Se supera el tope permitido.',
  'incomplete-variants': 'Hay variantes sin SKU.',
  'invalid-argument': 'Hay datos que no son válidos. Revisalos y reintentá.',
  'audit-write-failed': 'No pudimos completar la operación y no se aplicó ningún cambio. Reintentá.',
  'permission-denied': 'No tenés permiso para realizar esta operación.',
  unauthenticated: 'Tu sesión venció. Volvé a iniciar sesión.',
  'failed-precondition': 'No pudimos verificar la aplicación. Recargá la página.',
  unavailable: 'No hay conexión con el servidor. Revisá tu red y reintentá.',
  internal: 'Algo falló de nuestro lado. Reintentá en unos minutos.',
};

export function commandErrorMessage(code: CommandErrorCode): string {
  return MESSAGES[code];
}

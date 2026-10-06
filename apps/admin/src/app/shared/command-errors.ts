import type { CommandErrorCode } from '@ecommerce/application/client';

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
  'slug-conflict': 'Esa URL ya la usa otro producto, o está reservada.',
  'gtin-conflict': 'Ese código de barras ya lo usa otra variante.',
  'invalid-gtin': 'Ese código de barras no es válido. Revisá los dígitos.',
  'unsupported-video': 'Solo se admiten videos de YouTube o Vimeo.',
  'category-limit': 'Esa categoría quedaría fuera de los límites del árbol.',
  'category-name-taken': 'Ya hay una categoría con ese nombre en el mismo lugar.',
  'category-has-children': 'La categoría tiene subcategorías: movelas o eliminalas primero.',
  'section-full': 'La sección no tiene lugar para todos esos productos.',
  'digital-products': 'El envío gratis no se ofrece en productos digitales.',
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

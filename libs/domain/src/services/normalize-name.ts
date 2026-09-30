/**
 * Forma de un nombre para la búsqueda por prefijo (research §7): minúsculas, sin acentos ni
 * diacríticos, y con los espacios colapsados. Quien escribe "cafe" encuentra "Café".
 */
export function normalizeName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

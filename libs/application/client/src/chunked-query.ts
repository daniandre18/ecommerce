/**
 * Firestore admite hasta 30 valores en una condición `in` o `array-contains-any`. Filtrar por una
 * rama de categorías o por los productos de una sección puede pedir más: se parte en consultas de
 * hasta 30, que corren en paralelo, y se combinan (research §2 de la 002).
 */
export const MAX_IDS_PER_QUERY = 30;

/** Parte los ids en grupos de hasta `size`, en orden. Sin ids, ningún grupo: nada que consultar. */
export function chunkIds<T>(ids: readonly T[], size = MAX_IDS_PER_QUERY): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < ids.length; start += size) chunks.push(ids.slice(start, start + size));
  return chunks;
}

export interface MergeOptions<T> {
  /** Identidad del documento: el mismo puede llegar en dos grupos (un producto en dos categorías). */
  readonly key: (item: T) => string;
  /** El orden del listado; cada página ya viene ordenada así. */
  readonly compare: (a: T, b: T) => number;
  readonly limit: number;
}

/**
 * Combina las páginas de cada grupo en una sola: sin repetidos, en el orden pedido y cortada al
 * tamaño de página. Se corta DESPUÉS de combinar, porque el primero de todos puede venir en
 * cualquier grupo.
 */
export function mergePages<T>(pages: readonly (readonly T[])[], { key, compare, limit }: MergeOptions<T>): T[] {
  const unique = new Map<string, T>();
  for (const page of pages) {
    for (const item of page) if (!unique.has(key(item))) unique.set(key(item), item);
  }
  return [...unique.values()].sort(compare).slice(0, limit);
}

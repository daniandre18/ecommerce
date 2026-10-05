import { describe, expect, it } from 'vitest';
import { chunkIds, MAX_IDS_PER_QUERY, mergePages } from './chunked-query';

const ids = (count: number) => Array.from({ length: count }, (_, i) => `c${i + 1}`);

// T008 — Firestore admite hasta 30 valores en `in` y en `array-contains-any` (research §2 de la 002).
describe('chunkIds', () => {
  it('el tope es el de Firestore: 30 valores por consulta', () => {
    expect(MAX_IDS_PER_QUERY).toBe(30);
  });

  it('31 ids → un grupo de 30 y otro de 1', () => {
    expect(chunkIds(ids(31)).map((chunk) => chunk.length)).toEqual([30, 1]);
  });

  it('60 ids → dos grupos de 30', () => {
    expect(chunkIds(ids(60)).map((chunk) => chunk.length)).toEqual([30, 30]);
  });

  it('30 ids o menos → un solo grupo: el camino común es una sola consulta', () => {
    expect(chunkIds(ids(30))).toEqual([ids(30)]);
    expect(chunkIds(ids(5))).toEqual([ids(5)]);
  });

  it('sin ids no hay ninguna consulta que hacer', () => {
    expect(chunkIds([])).toEqual([]);
  });

  it('conserva todos los ids, en orden, sin repetir ninguno', () => {
    expect(chunkIds(ids(65)).flat()).toEqual(ids(65));
  });
});

interface Row {
  readonly id: string;
  readonly updatedAt: number;
}

const row = (id: string, updatedAt: number): Row => ({ id, updatedAt });
/** El orden del listado: lo más nuevo primero. */
const newestFirst = (a: Row, b: Row) => b.updatedAt - a.updatedAt;
const merge = (pages: Row[][], limit: number) => mergePages(pages, { key: (r) => r.id, compare: newestFirst, limit });

describe('mergePages', () => {
  it('combina las páginas de cada grupo en el orden pedido', () => {
    const merged = merge([[row('a', 9), row('c', 5)], [row('b', 7), row('d', 1)]], 10);
    expect(merged.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  // Un producto asignado a dos categorías que caen en grupos distintos llega en las dos páginas.
  it('un documento que llega en dos grupos aparece una sola vez', () => {
    const merged = merge([[row('a', 9), row('x', 5)], [row('x', 5), row('b', 3)]], 10);
    expect(merged.map((r) => r.id)).toEqual(['a', 'x', 'b']);
  });

  it('corta al tamaño de página después de combinar, no antes', () => {
    // Cada grupo trae su propia página: el más nuevo de todos puede estar en el segundo.
    const merged = merge([[row('a', 5), row('b', 4)], [row('z', 9), row('y', 8)]], 3);
    expect(merged.map((r) => r.id)).toEqual(['z', 'y', 'a']);
  });

  it('con una sola página, devuelve esa página cortada', () => {
    expect(merge([[row('a', 3), row('b', 2), row('c', 1)]], 2).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('sin páginas devuelve una lista vacía', () => {
    expect(merge([], 10)).toEqual([]);
  });
});

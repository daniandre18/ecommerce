import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUDIT_FILTER_FIELDS } from './firestore-audit-queries';

interface Index {
  readonly collectionGroup: string;
  readonly fields: readonly { readonly fieldPath: string; readonly order: string }[];
}

const { indexes } = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../../firestore.indexes.json'), 'utf8')) as { indexes: Index[] };

/** Todos los subconjuntos no vacíos de los filtros de igualdad. */
function combinations<T>(items: readonly T[]): T[][] {
  return items.reduce<T[][]>((all, item) => [...all, ...all.map((combo) => [...combo, item]), [item]], []);
}

// T083 — el emulador no exige índices compuestos: si falta uno, la consulta solo falla en producción.
describe('índices de la bitácora', () => {
  it.each(combinations(Object.values(AUDIT_FILTER_FIELDS)).map((combo) => [combo.join(' + '), combo] as const))(
    'filtrar por %s y ordenar por fecha tiene su índice',
    (_label, combo) => {
      const found = indexes.some(
        (index) =>
          index.collectionGroup === 'auditLog' &&
          index.fields.length === combo.length + 1 &&
          combo.every((field) => index.fields.some((f) => f.fieldPath === field && f.order === 'ASCENDING')) &&
          index.fields.at(-1)?.fieldPath === 'at' &&
          index.fields.at(-1)?.order === 'DESCENDING',
      );
      expect(found).toBe(true);
    },
  );
});

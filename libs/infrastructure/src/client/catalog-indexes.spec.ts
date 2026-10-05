import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRODUCT_ATTRIBUTE_FILTERS } from './firestore-catalog-queries';

interface IndexField {
  readonly fieldPath: string;
  readonly order?: string;
  readonly arrayConfig?: string;
}

interface Index {
  readonly collectionGroup: string;
  readonly fields: readonly IndexField[];
}

const { indexes } = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../../firestore.indexes.json'), 'utf8')) as { indexes: Index[] };

const matches = (field: IndexField | undefined, expected: IndexField) =>
  field?.fieldPath === expected.fieldPath && field.order === expected.order && field.arrayConfig === expected.arrayConfig;

// T036 — como la bitácora en la 001: el emulador no exige índices compuestos, así que una consulta
// sin su índice solo falla en producción. Cada filtro del listado, con y sin estado, tiene el suyo.
describe('índices del listado del catálogo', () => {
  const shapes = Object.entries(PRODUCT_ATTRIBUTE_FILTERS).flatMap(([name, field]) => [
    [`${name}`, [field]] as const,
    [`estado + ${name}`, [{ fieldPath: 'status', order: 'ASCENDING' }, field]] as const,
  ]);

  it.each(shapes)('archivados afuera, %s y ordenado por edición tiene su índice', (_label, filters) => {
    const expected: IndexField[] = [{ fieldPath: 'archived', order: 'ASCENDING' }, ...filters, { fieldPath: 'updatedAt', order: 'DESCENDING' }];
    const found = indexes.some(
      (index) =>
        index.collectionGroup === 'products' &&
        index.fields.length === expected.length &&
        expected.every((field, i) => matches(index.fields[i], field)),
    );
    expect(found).toBe(true);
  });

  it('los filtros son los de la Historia 1: etiqueta, marca y datos de envío faltantes', () => {
    expect(Object.keys(PRODUCT_ATTRIBUTE_FILTERS).sort()).toEqual(['brand', 'missingShippingData', 'tag']);
  });
});

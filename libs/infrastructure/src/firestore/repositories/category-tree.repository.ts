import type { CategoryTreeRepository } from '@ecommerce/application';
import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { categoryTreeFromDoc, categoryTreeToDoc } from '../../mapping/category-mappers';
import type { TenantPaths } from '../tenant-paths';

/** El árbol entero en `storefront/categoryTree`: leerlo es una lectura, sea cual sea su tamaño. */
export function categoryTreeRepository(t: Transaction, paths: TenantPaths): CategoryTreeRepository {
  const ref = paths.categoryTreeDoc();
  return {
    get: async () => categoryTreeFromDoc((await t.get(ref)).data()),
    save: async (tree) => {
      t.set(ref, { ...categoryTreeToDoc(tree), updatedAt: FieldValue.serverTimestamp() });
    },
  };
}

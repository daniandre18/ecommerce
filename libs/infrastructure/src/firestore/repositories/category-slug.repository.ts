import type { CategorySlugRepository } from '@ecommerce/application';
import { categoryId } from '@ecommerce/domain';
import type { Transaction } from 'firebase-admin/firestore';
import type { TenantPaths } from '../tenant-paths';

/**
 * Las URL anteriores de las categorías, una por documento en `categorySlugs/{slug}` (T110 de la 002).
 * Se escriben con `set`: la reserva de una categoría eliminada está libre y se pisa. Dos transacciones
 * que reservan la misma la leyeron antes, así que Firestore reintenta una de ellas.
 */
export function categorySlugRepository(t: Transaction, paths: TenantPaths): CategorySlugRepository {
  return {
    find: async (slug) => {
      const data = (await t.get(paths.categorySlugDoc(slug))).data();
      return data ? categoryId(String(data['categoryId'])) : null;
    },
    reserve: async (slug, owner) => {
      t.set(paths.categorySlugDoc(slug), { categoryId: owner, reservedAt: new Date() });
    },
    release: async (slug) => {
      t.delete(paths.categorySlugDoc(slug));
    },
  };
}

import type { FeaturedSectionsRepository } from '@ecommerce/application';
import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { sectionsFromDoc, sectionsToDoc } from '../../mapping/sections-mappers';
import type { TenantPaths } from '../tenant-paths';

/** Destacados y Ofertas en `storefront/sections`: se lee y se escribe en la misma transacción. */
export function sectionsRepository(t: Transaction, paths: TenantPaths): FeaturedSectionsRepository {
  const ref = paths.sectionsDoc();
  return {
    get: async () => sectionsFromDoc((await t.get(ref)).data()),
    save: async (sections) => {
      t.set(ref, { ...sectionsToDoc(sections), updatedAt: FieldValue.serverTimestamp() });
    },
  };
}

import type { VariantCostsRepository } from '@ecommerce/application';
import type { Money, VariantId } from '@ecommerce/domain';
import type { Transaction } from 'firebase-admin/firestore';
import type { TenantPaths } from '../tenant-paths';

/**
 * Un documento por producto con los costos de todas sus variantes (FR-015). Vive aparte de la
 * variante porque Firestore no protege campos sueltos, y así cargar 100 costos es una lectura.
 */
export function variantCostsRepository(t: Transaction, paths: TenantPaths): VariantCostsRepository {
  const costsOf = (productId: string) => paths.doc(`products/${productId}/private/costs`);
  return {
    findByProduct: async (productId) => {
      const snap = await t.get(costsOf(productId));
      return (snap.data()?.['costs'] ?? {}) as Record<VariantId, Money>;
    },
    setMany: async (productId, costs) => {
      t.set(costsOf(productId), { costs: { ...costs }, updatedAt: new Date() }, { merge: true });
    },
  };
}

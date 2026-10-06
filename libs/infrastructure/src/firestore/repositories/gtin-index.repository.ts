import type { GtinIndexRepository } from '@ecommerce/application';
import { gtin, productId, variantId } from '@ecommerce/domain';
import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import type { TenantPaths } from '../tenant-paths';

/**
 * `gtinIndex/{GTIN14}` (research §6 de la 002). La reserva se crea con `create`: si dos transacciones
 * reservan el mismo código, una falla al confirmar y no deja nada. No hay campo `archived`: archivar
 * la variante no libera su GTIN (FR-030).
 */
export function gtinIndexRepository(t: Transaction, paths: TenantPaths): GtinIndexRepository {
  return {
    find: async (value) => {
      const data = (await t.get(paths.gtinIndexDoc(value.normalized))).data();
      if (!data) return null;
      return { gtin: gtin(String(data['gtin'])), productId: productId(String(data['productId'])), variantId: variantId(String(data['variantId'])) };
    },
    reserve: async (entry) => {
      t.create(paths.gtinIndexDoc(entry.gtin.normalized), {
        gtin: entry.gtin.raw,
        productId: entry.productId,
        variantId: entry.variantId,
        createdAt: FieldValue.serverTimestamp(),
      });
    },
    release: async (value) => {
      t.delete(paths.gtinIndexDoc(value.normalized));
    },
  };
}

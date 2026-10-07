import { chunkIds, type CategoryPruner } from '@ecommerce/application';
import type { CategoryId, TenantId } from '@ecommerce/domain';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { TenantPaths } from './tenant-paths';

/** Lo que escribe un lote de Firestore como máximo. */
const MAX_BATCH = 500;

export interface PrunerOptions {
  readonly batchSize?: number;
  /** Solo para las pruebas: corta la poda después de ese número de lotes, como un corte real. */
  readonly failAfterBatches?: number;
}

/**
 * Quita de los productos los ids de categorías eliminadas (research §2 de la 002), en lotes de hasta
 * 500, fuera de cualquier transacción. Escribe SOLO `categoryIds`: ni `updatedAt` ni `version`, así
 * el producto no se mueve en el listado ni le provoca un conflicto a quien lo edita (FR-024).
 * Idempotente: cada vuelta busca los que todavía tienen alguno de los ids, hasta que no queda ninguno.
 */
export class FirestoreCategoryPruner implements CategoryPruner {
  private readonly paths: TenantPaths;

  constructor(
    private readonly db: Firestore,
    tenantId: TenantId,
    private readonly options: PrunerOptions = {},
  ) {
    this.paths = new TenantPaths(db, tenantId);
  }

  async prune(ids: readonly CategoryId[]): Promise<void> {
    const { batchSize = MAX_BATCH, failAfterBatches } = this.options;
    let batches = 0;
    // `array-contains-any` admite hasta 30 valores: con más pendientes, una tanda por grupo.
    for (const chunk of chunkIds(ids)) {
      for (;;) {
        if (failAfterBatches !== undefined && batches >= failAfterBatches) throw new Error('Poda cortada a propósito');
        const page = await this.paths.collection('products').where('categoryIds', 'array-contains-any', chunk).limit(batchSize).get();
        if (page.empty) break;
        const batch = this.db.batch();
        for (const doc of page.docs) batch.update(doc.ref, { categoryIds: FieldValue.arrayRemove(...ids) });
        await batch.commit();
        batches++;
      }
    }
  }
}

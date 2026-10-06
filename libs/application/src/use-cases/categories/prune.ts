import { completePrune } from '@ecommerce/domain';
import type { CategoryPruner } from '../../ports/repositories';
import type { UnitOfWork } from '../../ports/unit-of-work';

/**
 * La poda convergente (research §2, FR-024): quita de los productos los ids de `pendingPrune` y,
 * cuando terminó, los saca de la lista. Corre DESPUÉS de confirmar cada operación del árbol, fuera de
 * su transacción. Si se corta a la mitad, los ids siguen pendientes y la próxima la termina; mientras
 * tanto, todo lector los ignora con `resolveCategories`.
 */
export async function prunePendingCategories(uow: UnitOfWork, pruner: CategoryPruner): Promise<void> {
  const pending = await uow.run(async (tx) => (await tx.categories.get()).pendingPrune);
  if (pending.length === 0) return;
  await pruner.prune(pending);
  // Solo las que se podaron: una eliminada mientras tanto sigue pendiente.
  await uow.run(async (tx) => tx.categories.save(completePrune(await tx.categories.get(), pending)));
}

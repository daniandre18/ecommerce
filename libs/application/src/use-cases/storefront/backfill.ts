import type { ProductId } from '@ecommerce/domain';
import type { TransactionScope } from '../../ports/unit-of-work';
import { loadProduct, type UseCaseDependencies } from '../shared';
import { freeSlug, slugBaseFor } from './shared';

/**
 * Migración de un producto anterior a la 002 (T042): le asigna su URL amigable con las mismas reglas
 * y las mismas factorías que `CreateProduct`, y guarda los valores por defecto de la ficha que hasta
 * ahora el mapeador solo suponía. No es una operación de una persona: no tiene `requires` ni pasa
 * por la guarda; la corre la herramienta de migración, una transacción por producto.
 *
 * No cambia el estado, la versión ni `updatedAt`: el producto no se mueve en el listado ni le provoca
 * un conflicto a quien lo esté editando durante el despliegue. Es idempotente: un producto que ya
 * tiene URL no se toca.
 */
export class BackfillProductStorefront {
  constructor(private readonly deps: UseCaseDependencies) {}

  async execute(tx: TransactionScope, input: { readonly productId: ProductId }): Promise<'migrated' | 'already'> {
    const product = await loadProduct(tx, input.productId);
    if (product.slug !== null) return 'already';

    const { base, needsReplacement } = slugBaseFor(product.name, product.id);
    const slug = await freeSlug(tx, base, product.id, this.deps.ids);
    // Un producto ya publicado pudo enlazarse: su URL nace fija, como si la hubiera fijado publicarlo.
    await tx.products.save({ ...product, slug, slugNeedsReplacement: needsReplacement, slugLocked: product.publishedOnce });
    await tx.slugIndex.reserve(slug, product.id);
    return 'migrated';
  }
}

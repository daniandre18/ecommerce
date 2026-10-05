import { canChangeStatus, type ProductId, type ProductStatus } from '@ecommerce/domain';
import { BusinessRuleError } from '../errors';
import { requirePermission } from '../ports/authorization';
import type { OperationContext } from '../ports/operation-context';
import type { TransactionScope } from '../ports/unit-of-work';
import { assertVersion, bumped, loadProduct, type UseCaseDependencies } from './shared';

export interface SetProductStatusInput {
  readonly productId: ProductId;
  readonly version: number;
  readonly status: ProductStatus;
}

/** Activo, borrador o no listado (FR-023a). Para ofrecerse, todas las variantes deben estar completas. */
export class SetProductStatus {
  static readonly requires = requirePermission('catalog.write');

  constructor(private readonly deps: UseCaseDependencies) {}

  async execute(tx: TransactionScope, _ctx: OperationContext, input: SetProductStatusInput): Promise<{ version: number }> {
    const product = await loadProduct(tx, input.productId);
    const variants = await tx.variants.findByProduct(product.id);
    assertVersion(product, input.version);

    const allowed = canChangeStatus(variants, input.status);
    if (!allowed.ok) {
      throw allowed.error.kind === 'incomplete-variants'
        ? new BusinessRuleError('incomplete-variants', 'Hay variantes sin SKU', allowed.error)
        : new BusinessRuleError('invalid-argument', 'El producto no tiene variantes en circulación', allowed.error);
    }

    // Publicar fija la URL: desde ahora alguien pudo enlazarla, así que ni sigue al nombre ni, si se
    // cambia, se libera la anterior (FR-008 de la 002).
    const published = input.status !== 'draft';
    const updated = bumped({
      ...product,
      status: input.status,
      ...(published ? { publishedOnce: true, slugLocked: true } : {}),
      updatedAt: this.deps.clock.now(),
    });
    await tx.products.save(updated);
    return { version: updated.version };
  }
}

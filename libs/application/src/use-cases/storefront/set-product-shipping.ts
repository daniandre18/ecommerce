import { missingShippingData, type Dimensions, type ProductId } from '@ecommerce/domain';
import { BusinessRuleError } from '../../errors';
import { requirePermission } from '../../ports/authorization';
import type { OperationContext } from '../../ports/operation-context';
import type { TransactionScope } from '../../ports/unit-of-work';
import { assertVersion, bumped, loadProduct, type UseCaseDependencies } from '../shared';
import { dimensions, positiveInteger } from './shared';

export interface SetProductShippingInput {
  readonly productId: ProductId;
  readonly version: number;
  /** Gramos; `null` lo quita. */
  readonly weightGrams: number | null;
  /** Milímetros; `null` las quita. */
  readonly dimensionsMm: Dimensions | null;
}

/**
 * Peso y dimensiones de un producto físico (FR-014), con los que después se cotiza un envío. A un
 * digital no se le piden: no se envía. Recalcula la marca "faltan datos de envío" (FR-017).
 */
export class SetProductShipping {
  static readonly requires = requirePermission('catalog.write');

  constructor(private readonly deps: UseCaseDependencies) {}

  async execute(tx: TransactionScope, _ctx: OperationContext, input: SetProductShippingInput): Promise<{ version: number }> {
    const product = await loadProduct(tx, input.productId);
    const variants = await tx.variants.findByProduct(product.id);
    assertVersion(product, input.version);
    if (product.kind === 'digital') {
      throw new BusinessRuleError('invalid-argument', 'Un producto digital no lleva peso ni dimensiones');
    }

    const weightGrams = input.weightGrams === null ? null : positiveInteger(input.weightGrams, 'El peso');
    const dimensionsMm = input.dimensionsMm === null ? null : dimensions(input.dimensionsMm);
    const changed = { ...product, weightGrams, dimensionsMm };
    const updated = bumped({ ...changed, missingShippingData: missingShippingData(changed, variants), updatedAt: this.deps.clock.now() });
    await tx.products.save(updated);
    return { version: updated.version };
  }
}

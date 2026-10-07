import { summarizeVariants, type Variant, type VariantId } from '@ecommerce/domain';
import type { SetVariantShippingInput } from '@ecommerce/application/client';
import { BusinessRuleError } from '../../errors';
import { requirePermission } from '../../ports/authorization';
import type { OperationContext } from '../../ports/operation-context';
import type { TransactionScope } from '../../ports/unit-of-work';
import { assertBatch, assertVersion, bumped, findLiveVariant, loadProduct } from '../shared';
import { dimensions, positiveInteger } from './shared';

/**
 * Peso y dimensiones propios de las variantes de un físico (FR-015): los de las que difieren del
 * producto; las demás los heredan. A un digital no se le piden. Recalcula "Faltan datos de envío" del
 * producto sin cambiar su versión, como el resto de lo que el producto resume de sus variantes.
 */
export class SetVariantShipping {
  static readonly requires = requirePermission('catalog.write');

  async execute(tx: TransactionScope, _ctx: OperationContext, input: SetVariantShippingInput): Promise<{ versions: Record<VariantId, number> }> {
    assertBatch(input.changes);
    const product = await loadProduct(tx, input.productId);
    const variants = await tx.variants.findByProduct(product.id);
    if (product.kind === 'digital') {
      throw new BusinessRuleError('invalid-argument', 'Un producto digital no lleva peso ni dimensiones por variante');
    }

    const updated = new Map<VariantId, Variant>();
    for (const change of input.changes) {
      const variant = findLiveVariant(variants, change.variantId);
      assertVersion(variant, change.version);
      updated.set(
        variant.id,
        bumped({
          ...variant,
          ...(change.weightGrams === undefined ? {} : { weightGrams: change.weightGrams === null ? null : positiveInteger(change.weightGrams, 'El peso') }),
          ...(change.dimensionsMm === undefined ? {} : { dimensionsMm: change.dimensionsMm === null ? null : dimensions(change.dimensionsMm) }),
        }),
      );
    }
    for (const variant of updated.values()) await tx.variants.save(variant);
    await tx.products.updateVariantSummary(product.id, summarizeVariants(product, variants.map((v) => updated.get(v.id) ?? v)));
    return { versions: Object.fromEntries([...updated.values()].map((v) => [v.id, v.version])) as Record<VariantId, number> };
  }
}

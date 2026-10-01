import {
  reconcileVariants,
  summarizeVariants,
  validateOptionLimits,
  validateOptionStructure,
  variantId,
  type Assignment,
  type ProductId,
  type Variant,
  type VariantId,
  type VariationOption,
} from '@ecommerce/domain';
import { BusinessRuleError } from '../errors';
import { requirePermission } from '../ports/authorization';
import type { OperationContext } from '../ports/operation-context';
import type { TransactionScope } from '../ports/unit-of-work';
import { assertVersion, bumped, loadProduct, type UseCaseDependencies } from './shared';

export interface SetProductOptionsInput {
  readonly productId: ProductId;
  readonly version: number;
  /** Estructura completa. Los ids de opciones y valores nuevos los propone el cliente. */
  readonly options: readonly VariationOption[];
  readonly assignments: readonly Assignment[];
}

export interface SetProductOptionsOutput {
  readonly version: number;
  readonly created: readonly VariantId[];
  readonly preserved: readonly VariantId[];
  readonly archived: readonly VariantId[];
  readonly discarded: readonly VariantId[];
}

/** El editor de variaciones (FR-017, FR-018, FR-022, FR-024, FR-025, FR-026). */
export class SetProductOptions {
  static readonly requires = requirePermission('catalog.write');

  constructor(private readonly deps: UseCaseDependencies) {}

  async execute(tx: TransactionScope, _ctx: OperationContext, input: SetProductOptionsInput): Promise<SetProductOptionsOutput> {
    const product = await loadProduct(tx, input.productId);
    const current = await tx.variants.findByProduct(product.id);
    assertVersion(product, input.version);

    const structure = validateOptionStructure(input.options);
    if (!structure.ok) throw new BusinessRuleError('invalid-argument', 'Estructura de opciones inválida', structure.error);
    const limits = validateOptionLimits(input.options);
    if (!limits.ok) throw new BusinessRuleError('limit-exceeded', 'Se superan los topes de variación', limits.error);

    const reconciliation = reconcileVariants({
      product,
      current,
      previousOptions: product.options,
      options: input.options,
      assignments: input.assignments,
      newVariantId: () => variantId(this.deps.ids.next()),
    });
    if (!reconciliation.ok) {
      throw new BusinessRuleError('invalid-argument', 'Falta asignar el valor de la opción nueva', reconciliation.error);
    }
    const { preserved, created, archived, discarded } = reconciliation.value;

    // Las variantes que no cambian no se reescriben: incrementarles la versión provocaría
    // conflictos espurios a quien las esté editando.
    const before = new Map(current.map((variant) => [variant.id, variant]));
    for (const variant of preserved.filter((v) => combinationChanged(before.get(v.id), v))) {
      await tx.variants.save(bumped(variant));
    }
    for (const variant of created) await tx.variants.save(bumped(variant));
    for (const variant of archived) {
      await tx.variants.save(bumped(variant));
      if (variant.sku) await tx.skuIndex.markArchived(variant.sku.normalized);
    }
    for (const id of discarded) await tx.variants.delete(product.id, id);

    const updated = bumped({
      ...product,
      options: input.options,
      ...summarizeVariants([...preserved, ...created]),
      updatedAt: this.deps.clock.now(),
    });
    await tx.products.save(updated);

    return {
      version: updated.version,
      created: created.map((v) => v.id),
      preserved: preserved.map((v) => v.id),
      archived: archived.map((v) => v.id),
      discarded,
    };
  }
}

function combinationChanged(before: Variant | undefined, after: Variant): boolean {
  return before === undefined || JSON.stringify(sorted(before.optionValues)) !== JSON.stringify(sorted(after.optionValues));
}

const sorted = (combination: Variant['optionValues']) => Object.entries(combination).sort(([a], [b]) => a.localeCompare(b));

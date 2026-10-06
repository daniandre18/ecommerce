import { summarizeVariants, withoutProduct, type ProductId, type VariantId } from '@ecommerce/domain';
import { BusinessRuleError } from '../errors';
import { requirePermission } from '../ports/authorization';
import type { OperationContext } from '../ports/operation-context';
import type { TransactionScope } from '../ports/unit-of-work';
import { assertVersion, bumped, findLiveVariant, loadProduct, type UseCaseDependencies } from './shared';

/**
 * Archiva en lugar de borrar (FR-023). El archivado es independiente del estado (FR-023a). Desde la
 * 002 (FR-028), además saca el producto de Destacados y Ofertas en la misma transacción, y libera sus
 * lugares: el documento de secciones se lee antes de cualquier escritura y se escribe solo si el
 * producto figuraba en alguna.
 */
export class ArchiveProduct {
  static readonly requires = requirePermission('catalog.write');

  constructor(private readonly deps: UseCaseDependencies) {}

  async execute(
    tx: TransactionScope,
    _ctx: OperationContext,
    input: { readonly productId: ProductId; readonly version: number },
  ): Promise<{ version: number }> {
    const product = await loadProduct(tx, input.productId);
    const sections = await tx.sections.get();
    assertVersion(product, input.version);
    if (product.archived) return { version: product.version };

    const updated = bumped({ ...product, archived: true, updatedAt: this.deps.clock.now() });
    await tx.products.save(updated);
    const remaining = withoutProduct(sections, product.id);
    if (remaining !== sections) await tx.sections.save(remaining);
    return { version: updated.version };
  }
}

/** Saca una variante de circulación. Su SKU queda reservado para siempre (FR-023). */
export class ArchiveVariant {
  static readonly requires = requirePermission('catalog.write');

  async execute(
    tx: TransactionScope,
    _ctx: OperationContext,
    input: { readonly productId: ProductId; readonly variantId: VariantId; readonly version: number },
  ): Promise<{ version: number }> {
    const variants = await tx.variants.findByProduct(input.productId);
    const variant = findLiveVariant(variants, input.variantId);
    assertVersion(variant, input.version);

    const remaining = variants.filter((v) => !v.archived && v.id !== variant.id);
    if (remaining.length === 0) {
      throw new BusinessRuleError(
        'invalid-argument',
        'Es la última variante en circulación: para retirarla, archivá el producto',
      );
    }

    const updated = bumped({ ...variant, archived: true });
    await tx.variants.save(updated);
    if (variant.sku) await tx.skuIndex.markArchived(variant.sku.normalized);
    await tx.products.updateVariantSummary(input.productId, summarizeVariants(remaining));
    return { version: updated.version };
  }
}

import {
  InvalidSkuError,
  isVariantComplete,
  normalizeSku,
  summarizeVariants,
  type ProductId,
  type Sku,
  type VariantId,
} from '@ecommerce/domain';
import { BusinessRuleError } from '../errors';
import { requirePermission } from '../ports/authorization';
import type { OperationContext } from '../ports/operation-context';
import type { TransactionScope } from '../ports/unit-of-work';
import { assertVersion, bumped, findLiveVariant, loadProduct } from './shared';

export interface SetVariantSkuInput {
  readonly productId: ProductId;
  readonly variantId: VariantId;
  readonly version: number;
  readonly sku: string;
}

/**
 * Asigna el SKU de una variante (FR-021). La reserva en el índice va en la misma transacción que la
 * variante: si otra escritura toma el mismo SKU al mismo tiempo, una de las dos falla al confirmar.
 * Asignar el SKU puede volver la variante completa, y eso puede habilitar activar el producto.
 */
export class SetVariantSku {
  static readonly requires = requirePermission('catalog.write');

  async execute(
    tx: TransactionScope,
    _ctx: OperationContext,
    input: SetVariantSkuInput,
  ): Promise<{ version: number; complete: boolean }> {
    const sku = parseSku(input.sku);
    const product = await loadProduct(tx, input.productId);
    const variants = await tx.variants.findByProduct(input.productId);
    const occupant = await tx.skuIndex.find(sku.normalized);

    const variant = findLiveVariant(variants, input.variantId);
    assertVersion(variant, input.version);
    if (occupant && occupant.variantId !== variant.id) {
      throw new BusinessRuleError('sku-conflict', `El SKU ${sku.raw} ya lo usa otra variante`, {
        occupiedBy: occupant.variantId,
        productId: occupant.productId,
      });
    }
    if (occupant) return { version: variant.version, complete: true }; // ya es su SKU

    if (variant.sku) await tx.skuIndex.release(variant.sku.normalized);
    await tx.skuIndex.reserve({ sku, variantId: variant.id, productId: variant.productId });
    const updated = bumped({ ...variant, sku });
    await tx.variants.save(updated);
    await tx.products.updateVariantSummary(
      input.productId,
      summarizeVariants(product, variants.map((v) => (v.id === updated.id ? updated : v))),
    );
    return { version: updated.version, complete: isVariantComplete(updated) };
  }
}

function parseSku(raw: string): Sku {
  try {
    return normalizeSku(raw);
  } catch (error) {
    if (error instanceof InvalidSkuError) throw new BusinessRuleError('invalid-argument', error.message);
    throw error;
  }
}

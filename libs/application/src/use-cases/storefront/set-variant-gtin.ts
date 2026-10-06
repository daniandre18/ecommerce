import { gtin, InvalidGtinError, type Gtin, type ProductId, type VariantId } from '@ecommerce/domain';
import type { SetVariantGtinInput } from '@ecommerce/application/client';
import { BusinessRuleError } from '../../errors';
import { requirePermission } from '../../ports/authorization';
import type { OperationContext } from '../../ports/operation-context';
import type { TransactionScope } from '../../ports/unit-of-work';
import { assertVersion, bumped, findVariant, loadProduct } from '../shared';

/**
 * El GTIN de una variante (FR-030), reservado en `gtinIndex` en la misma transacción, como el SKU.
 * Archivar no lo libera: el de una variante archivada sigue reservado, y otra no puede tomarlo. La
 * única forma de liberarlo es quitárselo, también a una archivada; es lo único que se le puede
 * cambiar a una variante archivada.
 */
export class SetVariantGtin {
  static readonly requires = requirePermission('catalog.write');

  async execute(tx: TransactionScope, _ctx: OperationContext, input: SetVariantGtinInput): Promise<{ version: number }> {
    const next = input.gtin === null ? null : parseGtin(input.gtin);
    // Todas las lecturas antes que cualquier escritura.
    await loadProduct(tx, input.productId);
    const variants = await tx.variants.findByProduct(input.productId);
    const variant = findVariant(variants, input.variantId);
    if (variant.archived && next !== null) {
      throw new BusinessRuleError('invalid-argument', 'Una variante archivada no se edita: solo se le puede quitar el GTIN');
    }
    assertVersion(variant, input.version);

    if (next === null) {
      if (!variant.gtin) return { version: variant.version };
      await tx.gtinIndex.release(variant.gtin);
      return this.save(tx, { ...variant, gtin: null });
    }
    if (variant.gtin?.normalized === next.normalized) return { version: variant.version };

    const occupant = await tx.gtinIndex.find(next);
    if (occupant) await conflict(tx, next, occupant);

    if (variant.gtin) await tx.gtinIndex.release(variant.gtin);
    await tx.gtinIndex.reserve({ gtin: next, productId: variant.productId, variantId: variant.id });
    return this.save(tx, { ...variant, gtin: next });
  }

  private async save(tx: TransactionScope, variant: Parameters<TransactionScope['variants']['save']>[0]): Promise<{ version: number }> {
    const updated = bumped(variant);
    await tx.variants.save(updated);
    return { version: updated.version };
  }
}

/**
 * El rechazo nombra el producto que tiene el código y si está archivado (escenario 3). Lleva además
 * la versión de esa variante: si está archivada, el panel ofrece quitárselo ahí mismo (FR-030).
 */
async function conflict(tx: TransactionScope, code: Gtin, occupant: { productId: ProductId; variantId: VariantId }): Promise<never> {
  const holder = await tx.products.findById(occupant.productId);
  const holderVariant = (await tx.variants.findByProduct(occupant.productId)).find((v) => v.id === occupant.variantId);
  throw new BusinessRuleError('gtin-conflict', `El GTIN ${code.raw} ya lo usa otra variante`, {
    productId: occupant.productId,
    productName: holder?.name ?? null,
    variantId: occupant.variantId,
    version: holderVariant?.version ?? null,
    archived: (holder?.archived ?? false) || (holderVariant?.archived ?? false),
  });
}

function parseGtin(raw: string): Gtin {
  try {
    return gtin(raw);
  } catch (error) {
    if (error instanceof InvalidGtinError) throw new BusinessRuleError('invalid-gtin', error.message, { reason: error.reason });
    throw error;
  }
}

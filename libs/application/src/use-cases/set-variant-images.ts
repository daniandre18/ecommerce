import type { SetVariantImagesInput } from '@ecommerce/application/client';
import { requirePermission } from '../ports/authorization';
import type { OperationContext } from '../ports/operation-context';
import type { TransactionScope } from '../ports/unit-of-work';
import { assertVersion, bumped, findLiveVariant, validImages } from './shared';

/** Las imágenes propias de una variante (FR-020, T060), con las mismas reglas que las del producto. */
export class SetVariantImages {
  static readonly requires = requirePermission('catalog.write');

  async execute(tx: TransactionScope, ctx: OperationContext, input: SetVariantImagesInput): Promise<{ version: number }> {
    const variants = await tx.variants.findByProduct(input.productId);
    const variant = findLiveVariant(variants, input.variantId);
    assertVersion(variant, input.version);

    const updated = bumped({ ...variant, images: validImages(input.images, ctx.tenantId, input.productId) });
    await tx.variants.save(updated);
    return { version: updated.version };
  }
}

import type { ImageRef, ProductId, TenantId } from '@ecommerce/domain';
import { BusinessRuleError } from '../errors';
import { requirePermission } from '../ports/authorization';
import type { OperationContext } from '../ports/operation-context';
import type { TransactionScope } from '../ports/unit-of-work';
import { assertVersion, bumped, loadProduct, productName, type UseCaseDependencies } from './shared';

export interface UpdateProductDetailsInput {
  readonly productId: ProductId;
  readonly version: number;
  readonly name?: string;
  readonly description?: string;
  readonly images?: readonly ImageRef[];
}

export class UpdateProductDetails {
  static readonly requires = requirePermission('catalog.write');

  constructor(private readonly deps: UseCaseDependencies) {}

  async execute(tx: TransactionScope, ctx: OperationContext, input: UpdateProductDetailsInput): Promise<{ version: number }> {
    const product = await loadProduct(tx, input.productId);
    assertVersion(product, input.version);

    const updated = bumped({
      ...product,
      ...(input.name === undefined ? {} : productName(input.name)),
      description: input.description?.trim() ?? product.description,
      images: input.images === undefined ? product.images : validImages(input.images, ctx.tenantId, product.id),
      updatedAt: this.deps.clock.now(),
    });
    await tx.products.save(updated);
    return { version: updated.version };
  }
}

/**
 * Toda imagen lleva texto alternativo (FR-038a) y vive bajo la carpeta de su producto: una
 * referencia a la imagen de otro producto o de otro comercio se rechaza.
 */
function validImages(images: readonly ImageRef[], tenantId: TenantId, productId: ProductId): ImageRef[] {
  const folder = `tenants/${tenantId}/products/${productId}/`;
  return images.map((image) => {
    if (image.alt.trim() === '') {
      throw new BusinessRuleError('invalid-argument', 'Toda imagen necesita un texto alternativo');
    }
    if (!image.storagePath.startsWith(folder) || image.storagePath.includes('..')) {
      throw new BusinessRuleError('invalid-argument', 'La imagen no pertenece a este producto');
    }
    return { ...image, alt: image.alt.trim() };
  });
}

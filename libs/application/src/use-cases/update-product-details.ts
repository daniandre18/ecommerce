import type { ImageRef, ProductId } from '@ecommerce/domain';
import { requirePermission } from '../ports/authorization';
import type { OperationContext } from '../ports/operation-context';
import type { TransactionScope } from '../ports/unit-of-work';
import { assertVersion, bumped, loadProduct, productName, validImages, type UseCaseDependencies } from './shared';

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

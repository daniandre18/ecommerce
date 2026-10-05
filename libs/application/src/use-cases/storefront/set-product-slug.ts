import { slugify, type ProductId, type Slug } from '@ecommerce/domain';
import { BusinessRuleError } from '../../errors';
import { requirePermission } from '../../ports/authorization';
import type { OperationContext } from '../../ports/operation-context';
import type { TransactionScope } from '../../ports/unit-of-work';
import { assertVersion, bumped, loadProduct, type UseCaseDependencies } from '../shared';
import { moveSlug } from './shared';

export interface SetProductSlugInput {
  readonly productId: ProductId;
  readonly version: number;
  /** Lo que escribió el comercio; se normaliza con las mismas reglas que la generada (FR-007). */
  readonly slug: string;
}

/**
 * Edita la URL amigable (FR-007). Desde entonces deja de seguir al nombre; la anterior se libera o
 * queda reservada según el producto se haya publicado alguna vez (FR-008).
 */
export class SetProductSlug {
  static readonly requires = requirePermission('catalog.write');

  constructor(private readonly deps: UseCaseDependencies) {}

  async execute(tx: TransactionScope, _ctx: OperationContext, input: SetProductSlugInput): Promise<{ version: number; slug: Slug }> {
    const product = await loadProduct(tx, input.productId);
    assertVersion(product, input.version);
    const next = slugify(input.slug);
    if (!next) throw new BusinessRuleError('invalid-argument', 'La URL necesita al menos una letra o un número');

    const entry = await tx.slugIndex.find(next);
    if (entry && entry.productId !== product.id) {
      throw new BusinessRuleError('slug-conflict', `La URL ${next} ya la usa otro producto`, { productId: entry.productId });
    }

    await moveSlug(tx, product, next, entry?.kind === 'previous', product.id);
    const updated = bumped({ ...product, slug: next, slugLocked: true, slugNeedsReplacement: false, updatedAt: this.deps.clock.now() });
    await tx.products.save(updated);
    return { version: updated.version, slug: next };
  }
}

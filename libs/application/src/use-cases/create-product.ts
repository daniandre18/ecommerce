import {
  createIncompleteVariant,
  InvalidIdentifierError,
  productId,
  summarizeVariants,
  variantId,
  type ProductId,
  type VariantId,
} from '@ecommerce/domain';
import { BusinessRuleError } from '../errors';
import { requirePermission } from '../ports/authorization';
import type { OperationContext } from '../ports/operation-context';
import type { TransactionScope } from '../ports/unit-of-work';
import { bumped, productName, type UseCaseDependencies } from './shared';

export interface CreateProductInput {
  readonly name: string;
  readonly description: string;
}

/**
 * Crea el producto en borrador con su variante implícita (FR-020). Es idempotente por `requestId`:
 * el id del producto ES el requestId, así un reintento devuelve el producto ya creado en lugar de
 * duplicarlo, sin guardar nada extra.
 */
export class CreateProduct {
  static readonly requires = requirePermission('catalog.write');

  constructor(private readonly deps: UseCaseDependencies) {}

  async execute(
    tx: TransactionScope,
    ctx: OperationContext,
    input: CreateProductInput,
  ): Promise<{ productId: ProductId; variantId: VariantId }> {
    const id = idFromRequest(ctx.requestId);
    const existing = await tx.products.findById(id);
    if (existing) {
      const [first] = await tx.variants.findByProduct(id);
      if (!first) throw new BusinessRuleError('not-found', `El producto ${id} no tiene variantes`);
      return { productId: id, variantId: first.id };
    }

    const now = this.deps.clock.now();
    const implicit = createIncompleteVariant({
      id: variantId(this.deps.ids.next()),
      tenantId: ctx.tenantId,
      productId: id,
      optionValues: {},
    });
    await tx.products.save({
      id,
      tenantId: ctx.tenantId,
      ...productName(input.name),
      description: input.description.trim(),
      images: [],
      options: [],
      status: 'draft',
      archived: false,
      ...summarizeVariants([implicit]),
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    await tx.variants.save(bumped(implicit));
    return { productId: id, variantId: implicit.id };
  }
}

function idFromRequest(requestId: string): ProductId {
  try {
    return productId(requestId);
  } catch (error) {
    if (error instanceof InvalidIdentifierError) throw new BusinessRuleError('invalid-argument', 'requestId inválido');
    throw error;
  }
}

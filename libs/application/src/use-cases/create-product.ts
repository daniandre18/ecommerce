import {
  createIncompleteVariant,
  InvalidIdentifierError,
  productId,
  storefrontDefaults,
  summarizeVariants,
  variantId,
  type ProductId,
  type Slug,
  type VariantId,
} from '@ecommerce/domain';
import { BusinessRuleError } from '../errors';
import { requirePermission } from '../ports/authorization';
import type { OperationContext } from '../ports/operation-context';
import type { TransactionScope } from '../ports/unit-of-work';
import { bumped, productName, type UseCaseDependencies } from './shared';
import { freeSlug, slugBaseFor } from './storefront/shared';

export interface CreateProductInput {
  readonly name: string;
  readonly description: string;
}

/**
 * Crea el producto en borrador con su variante implícita (FR-020) y su URL amigable reservada
 * (FR-005, FR-006 de la 002). Es idempotente por `requestId`:
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
  ): Promise<{ productId: ProductId; variantId: VariantId; slug: Slug | null }> {
    const id = idFromRequest(ctx.requestId);
    const existing = await tx.products.findById(id);
    if (existing) {
      const [first] = await tx.variants.findByProduct(id);
      if (!first) throw new BusinessRuleError('not-found', `El producto ${id} no tiene variantes`);
      return { productId: id, variantId: first.id, slug: existing.slug };
    }

    // La URL amigable se elige leyendo, antes de cualquier escritura (FR-006). Si dos creaciones con el
    // mismo nombre eligen la misma, la reserva falla al confirmar y la transacción se reintenta.
    const { name, nameNormalized } = productName(input.name);
    const { base, needsReplacement } = slugBaseFor(name, id);
    const slug = await freeSlug(tx, base, id, this.deps.ids);

    const now = this.deps.clock.now();
    const implicit = createIncompleteVariant({
      id: variantId(this.deps.ids.next()),
      tenantId: ctx.tenantId,
      productId: id,
      optionValues: {},
    });
    const defaults = storefrontDefaults();
    await tx.products.save({
      ...defaults,
      slug,
      slugNeedsReplacement: needsReplacement,
      id,
      tenantId: ctx.tenantId,
      name,
      nameNormalized,
      description: input.description.trim(),
      images: [],
      options: [],
      status: 'draft',
      archived: false,
      ...summarizeVariants(defaults, [implicit]),
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    await tx.variants.save(bumped(implicit));
    await tx.slugIndex.reserve(slug, id);
    return { productId: id, variantId: implicit.id, slug };
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

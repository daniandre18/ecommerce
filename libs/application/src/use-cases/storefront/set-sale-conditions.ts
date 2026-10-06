import { batchId, buildAuditEntries, saleConditionChanges, type AuditEntryId, type BatchId, type Product, type ProductId } from '@ecommerce/domain';
import { BusinessRuleError } from '../../errors';
import { requirePermission } from '../../ports/authorization';
import type { OperationContext } from '../../ports/operation-context';
import type { TransactionScope } from '../../ports/unit-of-work';
import { MAX_BULK_PRODUCTS } from '../categories/shared';
import { actorOf, assertVersion, bumped, loadProduct, type UseCaseDependencies } from '../shared';

export interface SetSaleConditionsInput {
  readonly changes: readonly { readonly productId: ProductId; readonly version: number }[];
  /** Ausente, no se toca. */
  readonly priceVisible?: boolean;
  readonly freeShipping?: boolean;
}

export interface SetSaleConditionsOutput {
  readonly batchId: BatchId;
  /** Cuántos productos cambiaron; los que ya estaban así no cuentan. */
  readonly updated: number;
  readonly auditEntryIds: readonly AuditEntryId[];
}

/**
 * Precio visible y envío gratis, en uno o en varios productos (FR-026, FR-029). Lo que paga el
 * comprador es una decisión de precio: exige `variant.price.write`, no `catalog.write` (FR-003).
 * Todo o nada: con una versión vieja, o con envío gratis pedido para un digital, no se aplica a
 * ninguno. Qué entradas deja lo dice `saleConditionChanges`, comparando condiciones efectivas
 * (FR-032): una por campo y producto que cambie, todas con el mismo `batchId`.
 */
export class SetSaleConditions {
  static readonly requires = requirePermission('variant.price.write');

  constructor(private readonly deps: UseCaseDependencies) {}

  async execute(tx: TransactionScope, ctx: OperationContext, input: SetSaleConditionsInput): Promise<SetSaleConditionsOutput> {
    assertLot(input);
    const loaded = await Promise.all(input.changes.map(async ({ productId, version }) => ({ product: await loadProduct(tx, productId), version })));
    for (const { product, version } of loaded) assertVersion(product, version);
    const products = loaded.map(({ product }) => product);

    if (input.freeShipping === true) {
      const digital = products.filter((product) => product.kind === 'digital');
      if (digital.length > 0) {
        throw new BusinessRuleError('digital-products', 'El envío gratis no se ofrece en productos digitales', {
          productIds: digital.map((product) => product.id),
          names: digital.map((product) => product.name),
        });
      }
    }

    const now = this.deps.clock.now();
    const changed = products
      .map((product) => ({ before: product, after: withConditions(product, input) }))
      .filter(({ before, after }) => before.priceVisible !== after.priceVisible || before.freeShipping !== after.freeShipping);
    for (const { after } of changed) await tx.products.save(bumped({ ...after, updatedAt: now }));

    const batch = batchId(this.deps.ids.next());
    const entries = buildAuditEntries(
      actorOf(ctx),
      changed.flatMap(({ before, after }) => saleConditionChanges(before, after)),
      { batchId: batch, at: now, newEntryId: () => this.deps.ids.next() as AuditEntryId },
    );
    await tx.audit.append(entries);
    return { batchId: batch, updated: changed.length, auditEntryIds: entries.map((entry) => entry.id) };
  }
}

function withConditions(product: Product, input: SetSaleConditionsInput): Product {
  return {
    ...product,
    ...(input.priceVisible === undefined ? {} : { priceVisible: input.priceVisible }),
    ...(input.freeShipping === undefined ? {} : { freeShipping: input.freeShipping }),
  };
}

function assertLot(input: SetSaleConditionsInput): void {
  if (input.priceVisible === undefined && input.freeShipping === undefined) {
    throw new BusinessRuleError('invalid-argument', 'No hay ninguna condición para cambiar');
  }
  if (input.changes.length === 0) throw new BusinessRuleError('invalid-argument', 'No hay productos seleccionados');
  if (input.changes.length > MAX_BULK_PRODUCTS) {
    throw new BusinessRuleError('limit-exceeded', `Una acción masiva admite hasta ${MAX_BULK_PRODUCTS} productos`, {
      max: MAX_BULK_PRODUCTS,
      actual: input.changes.length,
    });
  }
  const ids = input.changes.map((change) => change.productId);
  if (new Set(ids).size !== ids.length) throw new BusinessRuleError('invalid-argument', 'Un producto aparece más de una vez en el lote');
}

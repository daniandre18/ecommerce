import {
  batchId,
  buildAuditEntries,
  moneyEquals,
  stockEquals,
  type AuditedChange,
  type AuditEntryId,
  type Money,
  type Variant,
  type VariantId,
} from '@ecommerce/domain';
import type { AmountsOutput, SetVariantCostInput, SetVariantPriceInput, SetVariantStockInput } from '@ecommerce/application/client';
import { requirePermission } from '../ports/authorization';
import type { OperationContext } from '../ports/operation-context';
import type { TransactionScope } from '../ports/unit-of-work';
import {
  actorOf,
  assertBatch,
  assertCurrency,
  assertVersion,
  bumped,
  findLiveVariant,
  loadTenant,
  type UseCaseDependencies,
} from './shared';

/**
 * Base de los tres casos de uso que alteran importes o existencias. Comparten lo que FR-030 y
 * FR-033 exigen: todas las validaciones antes de escribir, el cambio y su entrada de bitácora en la
 * misma transacción, una entrada por cambio, y nada aplicado si un solo cambio del lote falla.
 */
abstract class AuditedBatch {
  constructor(protected readonly deps: UseCaseDependencies) {}

  protected async record(tx: TransactionScope, ctx: OperationContext, changes: readonly AuditedChange[]) {
    const batch = batchId(this.deps.ids.next());
    const entries = buildAuditEntries(actorOf(ctx), changes, {
      batchId: batch,
      at: this.deps.clock.now(),
      newEntryId: () => this.deps.ids.next() as AuditEntryId,
    });
    await tx.audit.append(entries);
    return { batchId: batch, auditEntryIds: entries.map((entry) => entry.id) };
  }
}

/** Precio de venta y precio comparativo (FR-015, FR-028). El rol de Catálogo no los modifica. */
export class SetVariantPrice extends AuditedBatch {
  static readonly requires = requirePermission('variant.price.write');

  async execute(tx: TransactionScope, ctx: OperationContext, input: SetVariantPriceInput): Promise<AmountsOutput> {
    assertBatch(input.changes);
    const tenant = await loadTenant(tx);
    const variants = await tx.variants.findByProduct(input.productId);

    const audited: AuditedChange[] = [];
    const changed: Variant[] = [];
    for (const change of input.changes) {
      const variant = findLiveVariant(variants, change.variantId);
      assertVersion(variant, change.version);
      let next = variant;
      if (change.price !== undefined) {
        assertCurrency(change.price, tenant);
        if (!moneyEquals(variant.price, change.price)) {
          audited.push(priceChange(variant, 'price', variant.price, change.price));
          next = { ...next, price: change.price };
        }
      }
      if (change.compareAtPrice !== undefined) {
        if (change.compareAtPrice) assertCurrency(change.compareAtPrice, tenant);
        if (!moneyEquals(variant.compareAtPrice, change.compareAtPrice)) {
          audited.push(priceChange(variant, 'compareAtPrice', variant.compareAtPrice, change.compareAtPrice));
          next = { ...next, compareAtPrice: change.compareAtPrice };
        }
      }
      if (next !== variant) changed.push(bumped(next));
    }

    for (const variant of changed) await tx.variants.save(variant);
    return { ...(await this.record(tx, ctx, audited)), updated: changed.length };
  }
}

/** Costo de adquisición, en su documento aparte (FR-015): sin el permiso de costo, ni se ve. */
export class SetVariantCost extends AuditedBatch {
  static readonly requires = requirePermission('variant.cost.write');

  async execute(tx: TransactionScope, ctx: OperationContext, input: SetVariantCostInput): Promise<AmountsOutput> {
    assertBatch(input.changes);
    const tenant = await loadTenant(tx);
    const variants = await tx.variants.findByProduct(input.productId);
    const costs = await tx.costs.findByProduct(input.productId);

    const audited: AuditedChange[] = [];
    const updates: Record<VariantId, Money> = {};
    for (const change of input.changes) {
      const variant = findLiveVariant(variants, change.variantId);
      assertCurrency(change.cost, tenant);
      const before = costs[variant.id] ?? null;
      if (!moneyEquals(before, change.cost)) {
        audited.push(priceChange(variant, 'cost', before, change.cost));
        updates[variant.id] = change.cost;
      }
    }

    if (audited.length > 0) await tx.costs.setMany(input.productId, updates);
    return { ...(await this.record(tx, ctx, audited)), updated: audited.length };
  }
}

/** Existencias, distinguiendo "sin definir" de cero (FR-029). */
export class SetVariantStock extends AuditedBatch {
  static readonly requires = requirePermission('variant.stock.write');

  async execute(tx: TransactionScope, ctx: OperationContext, input: SetVariantStockInput): Promise<AmountsOutput> {
    assertBatch(input.changes);
    const variants = await tx.variants.findByProduct(input.productId);

    const audited: AuditedChange[] = [];
    const changed: Variant[] = [];
    for (const change of input.changes) {
      const variant = findLiveVariant(variants, change.variantId);
      assertVersion(variant, change.version);
      if (stockEquals(variant.stock, change.stock)) continue;
      audited.push({
        type: 'stock.adjusted',
        productId: variant.productId,
        variantId: variant.id,
        before: variant.stock,
        after: change.stock,
      });
      changed.push(bumped({ ...variant, stock: change.stock }));
    }

    for (const variant of changed) await tx.variants.save(variant);
    return { ...(await this.record(tx, ctx, audited)), updated: changed.length };
  }
}

function priceChange(
  variant: Variant,
  field: 'price' | 'compareAtPrice' | 'cost',
  before: Money | null,
  after: Money | null,
): AuditedChange {
  return { type: 'price.changed', field, productId: variant.productId, variantId: variant.id, before, after };
}

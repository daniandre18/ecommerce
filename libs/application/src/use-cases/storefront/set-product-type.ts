import {
  buildAuditEntries,
  missingShippingData,
  saleConditionChanges,
  type AuditEntryId,
} from '@ecommerce/domain';
import type { BuyerChange, SetProductTypeInput } from '@ecommerce/application/client';
import { requirePermission } from '../../ports/authorization';
import type { OperationContext } from '../../ports/operation-context';
import type { TransactionScope } from '../../ports/unit-of-work';
import { actorOf, assertVersion, bumped, loadProduct, type UseCaseDependencies } from '../shared';

/**
 * Físico o digital (FR-013, FR-016). Es una decisión de catálogo —basta con editar el catálogo—,
 * pero cambia lo que paga el comprador por el envío, así que deja su entrada de condiciones de venta
 * en la misma transacción (FR-032). Qué entradas deja no lo decide este caso de uso: lo dice
 * `saleConditionChanges`, comparando condiciones efectivas. Peso, dimensiones y envío gratis se
 * conservan aunque pase a digital, para que vuelvan si pasa a físico otra vez.
 */
export class SetProductType {
  static readonly requires = requirePermission('catalog.write');

  constructor(private readonly deps: UseCaseDependencies) {}

  async execute(tx: TransactionScope, ctx: OperationContext, input: SetProductTypeInput): Promise<{ version: number; changes: BuyerChange[] }> {
    const product = await loadProduct(tx, input.productId);
    const variants = await tx.variants.findByProduct(product.id);
    assertVersion(product, input.version);
    if (product.kind === input.kind) return { version: product.version, changes: [] };

    const now = this.deps.clock.now();
    const changed = { ...product, kind: input.kind };
    const updated = bumped({ ...changed, missingShippingData: missingShippingData(changed, variants), updatedAt: now });
    const changes = saleConditionChanges(product, updated);

    await tx.products.save(updated);
    await tx.audit.append(
      buildAuditEntries(actorOf(ctx), changes, { batchId: null, at: now, newEntryId: () => this.deps.ids.next() as AuditEntryId }),
    );
    return { version: updated.version, changes: changes.map(({ field, before, after }) => ({ field, before, after })) };
  }
}

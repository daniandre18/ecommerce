import type { AuditEntry, PriceField } from '../entities/audit-entry';
import type { AuditEntryId, BatchId, ProductId, TenantId, Uid, VariantId } from '../value-objects/ids';
import type { Money } from '../value-objects/money';
import type { StockLevel } from '../value-objects/stock-level';

export interface AuditActor {
  readonly tenantId: TenantId;
  readonly uid: Uid;
  /** Se copia a la entrada: la bitácora se lee sin resolver cuentas y sobrevive a la baja (FR-031). */
  readonly name: string;
}

/** Cada cambio lleva su propio tipo de evento, así el tipo de la entrada no puede contradecirlo. */
export type AuditedChange =
  | {
      readonly type: 'price.changed';
      readonly field: PriceField;
      readonly productId: ProductId;
      readonly variantId: VariantId;
      readonly before: Money | null;
      readonly after: Money | null;
    }
  | {
      readonly type: 'stock.adjusted';
      readonly productId: ProductId;
      readonly variantId: VariantId;
      readonly before: StockLevel;
      readonly after: StockLevel;
    };

/**
 * Una entrada por cambio, todas con el mismo `batchId` cuando vienen de una acción masiva (FR-030).
 * Es pura: el caso de uso las escribe en la misma transacción que el cambio (FR-030, FR-033).
 */
export function buildAuditEntries(
  actor: AuditActor,
  changes: readonly AuditedChange[],
  meta: { readonly batchId: BatchId | null; readonly at: Date; readonly newEntryId: () => AuditEntryId },
): AuditEntry[] {
  return changes.map((change) => {
    const common = {
      id: meta.newEntryId(),
      tenantId: actor.tenantId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorKind: 'member' as const,
      at: meta.at,
      batchId: meta.batchId,
      entity: { kind: 'variant' as const, id: change.variantId, productId: change.productId },
    };
    return change.type === 'price.changed'
      ? { ...common, type: change.type, field: change.field, before: change.before, after: change.after }
      : { ...common, type: change.type, before: change.before, after: change.after };
  });
}

import type {
  AuditEntity,
  AuditEntry,
  PriceField,
  RoleChangeKind,
  RoleSnapshot,
  SaleConditionField,
  SaleConditionValue,
} from '../entities/audit-entry';
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
    }
  | {
      /** Del producto, no de una variante (FR-032 de la 002). Lo produce `saleConditionChanges`. */
      readonly type: 'sale-conditions.changed';
      readonly field: SaleConditionField;
      readonly productId: ProductId;
      readonly before: SaleConditionValue;
      readonly after: SaleConditionValue;
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
    };
    switch (change.type) {
      case 'price.changed':
        return { ...common, entity: variantEntity(change), type: change.type, field: change.field, before: change.before, after: change.after };
      case 'stock.adjusted':
        return { ...common, entity: variantEntity(change), type: change.type, before: change.before, after: change.after };
      case 'sale-conditions.changed':
        return {
          ...common,
          entity: { kind: 'product', id: change.productId, productId: change.productId },
          type: change.type,
          field: change.field,
          before: change.before,
          after: change.after,
        };
    }
  });
}

const variantEntity = (change: { readonly productId: ProductId; readonly variantId: VariantId }): AuditEntity => ({
  kind: 'variant',
  id: change.variantId,
  productId: change.productId,
});

/** Un cambio de equipo: roles, permisos, membresías, invitaciones o propiedad (FR-031a). */
export interface TeamChange {
  readonly change: RoleChangeKind;
  readonly entity: Pick<AuditEntity, 'kind' | 'id'>;
  readonly before: RoleSnapshot | null;
  readonly after: RoleSnapshot | null;
}

/** Una entrada `role.changed`, con lo anterior y lo resultante (FR-031). */
export function buildTeamAuditEntry(actor: AuditActor, change: TeamChange, meta: { readonly at: Date; readonly id: AuditEntryId }): AuditEntry {
  return {
    id: meta.id,
    tenantId: actor.tenantId,
    actorUid: actor.uid,
    actorName: actor.name,
    actorKind: 'member',
    at: meta.at,
    batchId: null,
    entity: { kind: change.entity.kind, id: change.entity.id },
    type: 'role.changed',
    change: change.change,
    before: change.before,
    after: change.after,
  };
}

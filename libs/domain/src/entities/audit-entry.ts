import type {
  AuditEntryId,
  BatchId,
  PlatformOperatorId,
  ProductId,
  TenantId,
  Uid,
} from '../value-objects/ids';
import type { Money } from '../value-objects/money';
import type { Permission } from '../value-objects/permission';
import type { StockLevel } from '../value-objects/stock-level';

/** Los cuatro tipos mínimos de FR-031. */
export type AuditEventType = 'price.changed' | 'stock.adjusted' | 'role.changed' | 'platform.action';

export interface AuditEntity {
  readonly kind: 'variant' | 'product' | 'role' | 'membership' | 'tenant';
  readonly id: string;
  readonly productId?: ProductId;
}

interface AuditEntryBase {
  readonly id: AuditEntryId;
  readonly tenantId: TenantId;
  readonly actorUid: Uid | PlatformOperatorId;
  /** Copia al momento del hecho: la bitácora se lee sin resolver cuentas y sobrevive a la baja. */
  readonly actorName: string;
  readonly actorKind: 'member' | 'platform-operator';
  /** Del servidor, nunca del cliente. */
  readonly at: Date;
  readonly entity: AuditEntity;
  /** Agrupa las entradas de una edición masiva (FR-030). */
  readonly batchId: BatchId | null;
}

/** Qué importe cambió. El costo usa el mismo tipo de evento pero se distingue acá. */
export type PriceField = 'price' | 'compareAtPrice' | 'cost';

export type RoleChangeKind =
  | 'role.created'
  | 'role.updated'
  | 'role.deleted'
  | 'role.assigned'
  | 'role.revoked'
  | 'membership.added'
  | 'membership.disabled'
  | 'membership.reactivated'
  | 'ownership.transferred';

export interface RoleSnapshot {
  readonly roleId?: string;
  readonly roleName?: string;
  readonly permissions?: readonly Permission[];
  readonly isOwner?: boolean;
  readonly status?: string;
}

/**
 * Unión etiquetada por `type`: `before` y `after` tienen el tipo correcto en cada caso en vez de
 * ser `unknown`. Cada variante declara qué representan sus valores (FR-031).
 */
export type AuditEntry =
  | (AuditEntryBase & {
      readonly type: 'price.changed';
      readonly field: PriceField;
      readonly before: Money | null;
      readonly after: Money | null;
    })
  | (AuditEntryBase & {
      readonly type: 'stock.adjusted';
      readonly before: StockLevel;
      readonly after: StockLevel;
    })
  | (AuditEntryBase & {
      readonly type: 'role.changed';
      readonly change: RoleChangeKind;
      readonly before: RoleSnapshot | null;
      readonly after: RoleSnapshot | null;
    })
  | (AuditEntryBase & {
      readonly type: 'platform.action';
      readonly before: Readonly<Record<string, unknown>> | null;
      readonly after: Readonly<Record<string, unknown>> | null;
    });

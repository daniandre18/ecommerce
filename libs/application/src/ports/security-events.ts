import type { TenantId, Uid } from '@ecommerce/domain';

/** Evento de seguridad de un intento denegado que atravesó la capa de servicios (FR-004). */
export interface SecurityEvent {
  readonly tenantId: TenantId;
  readonly actorUid: Uid | null;
  readonly kind: 'cross-tenant-access' | 'permission-denied';
  readonly at: Date;
  readonly detail: { readonly operation: string; readonly reason: string };
}

/** Se escribe FUERA de la transacción denegada: si la mutación se revierte, el evento debe quedar. */
export interface SecurityEventRecorder {
  record(event: SecurityEvent): Promise<void>;
}

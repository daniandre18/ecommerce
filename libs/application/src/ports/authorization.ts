import type { Permission, TenantId, Uid } from '@ecommerce/domain';
import type { OperationContext } from './operation-context';
import type { TransactionScope } from './unit-of-work';

export class PermissionDeniedError extends Error {
  override readonly name = 'PermissionDeniedError';
}

/**
 * Default-deny: lanza `PermissionDeniedError` salvo concesión explícita. Recibe el `TransactionScope`
 * porque la membresía y el rol se leen DENTRO de la transacción de la mutación: una baja o un
 * cambio de permisos concurrente no se cuela (FR-008).
 */
export interface AuthorizationService {
  assert(tx: TransactionScope, ctx: OperationContext, permission: Permission): Promise<void>;
  assertOwner(tx: TransactionScope, ctx: OperationContext): Promise<void>;
}

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

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

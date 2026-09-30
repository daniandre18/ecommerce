import type { TenantId, Uid } from '@ecommerce/domain';

/**
 * Contexto de una operación. El `tenantId` llega del cliente —una cuenta puede estar en varios
 * comercios (FR-005)— pero este objeto solo se construye DESPUÉS de verificar la membresía activa.
 * Los casos de uso reciben un contexto ya verificado: no verifican pertenencia.
 */
export interface OperationContext {
  readonly tenantId: TenantId;
  readonly actorUid: Uid;
  readonly actorName: string;
  readonly requestId: string;
}

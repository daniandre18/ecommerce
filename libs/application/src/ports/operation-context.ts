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
  /** Del token de sesión. Lo usa aceptar una invitación, que va dirigida a un correo. */
  readonly actorEmail: string | null;
  readonly requestId: string;
}

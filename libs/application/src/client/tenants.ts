import type { TenantId, Uid } from '@ecommerce/domain';
import type { Unsubscribe, Watcher } from './queries';

/** Un comercio en el que la cuenta tiene membresía activa. */
export interface TenantAccess {
  readonly tenantId: TenantId;
  readonly name: string;
  readonly isOwner: boolean;
}

/**
 * Los comercios de una cuenta (T075, FR-005). Cada membresía es independiente: una cuenta puede
 * ser Propietaria en un comercio y colaboradora en otro.
 */
export interface TenantDirectory {
  /** Solo membresías activas: una invitación sin aceptar o una baja no dan acceso (FR-007, FR-008a). */
  watchTenantsOf(uid: Uid, watcher: Watcher<readonly TenantAccess[]>): Unsubscribe;
}

import type { MemberAccess, TenantId, Uid } from '@ecommerce/domain';
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
  /**
   * Qué puede hacer la cuenta en un comercio: si es su Propietaria y los permisos de su rol, al día
   * con cada cambio de rol o de permisos. `null` sin membresía activa. El panel lo usa solo para no
   * ofrecer lo que el servidor rechazaría: el control real está en el servidor (FR-010, FR-040).
   */
  watchAccess(tenantId: TenantId, uid: Uid, watcher: Watcher<MemberAccess | null>): Unsubscribe;
}

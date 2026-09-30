import type { PlatformOperatorId, TenantId, Uid } from '../value-objects/ids';
import type { CurrencyCode } from '../value-objects/money';

/** Unidad de aislamiento. Solo el operador de la plataforma lo crea (FR-041). */
export interface Tenant {
  readonly id: TenantId;
  readonly name: string;
  /** Exactamente uno (FR-011). */
  readonly ownerUid: Uid;
  /** La moneda es del inquilino, no de la variante. */
  readonly currency: CurrencyCode;
  readonly createdAt: Date;
  readonly createdBy: PlatformOperatorId;
  readonly status: 'active' | 'suspended';
}

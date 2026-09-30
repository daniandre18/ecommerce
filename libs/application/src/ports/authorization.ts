import type { Permission } from '@ecommerce/domain';
import type { OperationContext } from './operation-context';
import type { TransactionScope } from './unit-of-work';

export class PermissionDeniedError extends Error {
  override readonly name: string = 'PermissionDeniedError';
}

/**
 * La cuenta no tiene ninguna membresía en el comercio al que intentó acceder: es un intento de
 * acceso cruzado entre comercios (FR-004). Una membresía dada de baja NO cae acá: esa persona es
 * del comercio, solo que ya no opera.
 */
export class NotAMemberError extends PermissionDeniedError {
  override readonly name = 'NotAMemberError';
}

/** Lo que exige una operación: un permiso concreto o ser Propietario del comercio. */
export type Requirement =
  | { readonly kind: 'permission'; readonly permission: Permission }
  | { readonly kind: 'owner' };

export const requirePermission = (permission: Permission): Requirement => ({ kind: 'permission', permission });
export const requireOwner = (): Requirement => ({ kind: 'owner' });

/**
 * Default-deny: lanza `PermissionDeniedError` salvo concesión explícita. Recibe el `TransactionScope`
 * porque la membresía y el rol se leen DENTRO de la transacción de la mutación: una baja o un
 * cambio de permisos concurrente no se cuela (FR-008).
 */
export interface AuthorizationService {
  assert(tx: TransactionScope, ctx: OperationContext, permission: Permission): Promise<void>;
  assertOwner(tx: TransactionScope, ctx: OperationContext): Promise<void>;
}

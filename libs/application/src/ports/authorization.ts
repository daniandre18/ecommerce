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

/**
 * Lo que exige una operación: un permiso concreto, ser Propietario del comercio, o solo una cuenta
 * con sesión. Esto último es únicamente para aceptar una invitación: quien acepta todavía no es
 * miembro, y el caso de uso verifica que la invitación sea para su correo.
 */
export type Requirement =
  | { readonly kind: 'permission'; readonly permission: Permission }
  | { readonly kind: 'owner' }
  | { readonly kind: 'account' };

export const requirePermission = (permission: Permission): Requirement => ({ kind: 'permission', permission });
export const requireOwner = (): Requirement => ({ kind: 'owner' });
export const requireAccount = (): Requirement => ({ kind: 'account' });

/**
 * Default-deny: lanza `PermissionDeniedError` salvo concesión explícita. Recibe el `TransactionScope`
 * porque la membresía y el rol se leen DENTRO de la transacción de la mutación: una baja o un
 * cambio de permisos concurrente no se cuela (FR-008).
 */
export interface AuthorizationService {
  assert(tx: TransactionScope, ctx: OperationContext, permission: Permission): Promise<void>;
  assertOwner(tx: TransactionScope, ctx: OperationContext): Promise<void>;
}

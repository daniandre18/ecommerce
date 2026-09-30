import type { Permission } from '@ecommerce/domain';
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

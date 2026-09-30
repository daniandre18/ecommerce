import { randomUUID } from 'node:crypto';
import {
  NotAMemberError,
  PermissionDeniedError,
  type AuthorizationService,
  type Clock,
  type OperationContext,
  type Requirement,
  type SecurityEventRecorder,
  type TransactionScope,
  type UnitOfWork,
} from '@ecommerce/application';
import { InvalidIdentifierError, tenantId, uid, type TenantId } from '@ecommerce/domain';
import { HttpsError, type CallableRequest } from 'firebase-functions/https';

export interface GuardedOperation {
  /** Nombre de la callable; se registra en los eventos de seguridad. */
  readonly operation: string;
  readonly requires: Requirement;
}

export interface GuardDependencies {
  /** La unidad de trabajo queda atada al comercio: ninguna ruta puede apuntar a otro. */
  readonly unitOfWorkFor: (tenantId: TenantId) => UnitOfWork;
  readonly authorization: AuthorizationService;
  readonly securityEvents: SecurityEventRecorder;
  readonly clock: Clock;
}

/** Mismo mensaje para "no sos miembro" y "no tenés el permiso": no revela si el comercio existe. */
const DENIED = 'No tenés permiso para realizar esta operación';

/**
 * La única puerta de entrada de toda mutación. Verifica, en el orden del contrato:
 * sesión → App Check → `tenantId` válido → membresía activa → permiso; y recién entonces ejecuta
 * `work` dentro de la misma transacción en que se verificó el permiso.
 *
 * El cliente propone el comercio (una cuenta puede estar en varios, FR-005); la guarda lo verifica
 * contra la membresía (FR-003). Las denegaciones se registran como evento de seguridad (FR-004).
 */
export async function guarded<T>(
  request: CallableRequest<unknown>,
  { operation, requires }: GuardedOperation,
  deps: GuardDependencies,
  work: (tx: TransactionScope, ctx: OperationContext) => Promise<T>,
): Promise<T> {
  const ctx = verifiedContext(request);
  try {
    return await deps.unitOfWorkFor(ctx.tenantId).run(async (tx) => {
      await authorize(deps.authorization, tx, ctx, requires);
      return work(tx, ctx);
    });
  } catch (error) {
    if (!(error instanceof PermissionDeniedError)) throw error;
    await recordDenial(deps, ctx, operation, error);
    throw new HttpsError('permission-denied', DENIED);
  }
}

function verifiedContext(request: CallableRequest<unknown>): OperationContext {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Hace falta iniciar sesión');
  }
  // `enforceAppCheck` ya lo exige en la declaración de la callable; esto es la segunda barrera.
  if (!request.app) {
    throw new HttpsError('failed-precondition', 'Falta la verificación de App Check');
  }
  const data = isRecord(request.data) ? request.data : {};
  const token = request.auth.token as { name?: unknown; email?: unknown };
  return {
    tenantId: parseTenantId(data['tenantId']),
    actorUid: uid(request.auth.uid),
    actorName: firstString(token.name, token.email) ?? request.auth.uid,
    requestId: firstString(data['requestId']) ?? randomUUID(),
  };
}

function parseTenantId(value: unknown): TenantId {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'Falta el comercio sobre el que se opera (tenantId)');
  }
  try {
    return tenantId(value);
  } catch (error) {
    if (error instanceof InvalidIdentifierError) throw new HttpsError('invalid-argument', 'tenantId inválido');
    throw error;
  }
}

function authorize(authz: AuthorizationService, tx: TransactionScope, ctx: OperationContext, requires: Requirement) {
  return requires.kind === 'owner' ? authz.assertOwner(tx, ctx) : authz.assert(tx, ctx, requires.permission);
}

/**
 * Fuera de la transacción: la operación denegada se revierte y el evento tiene que quedar. Si el
 * registro falla, se deniega igual —la denegación nunca se convierte en un error interno— y se
 * deja constancia en el log de la plataforma.
 */
async function recordDenial(deps: GuardDependencies, ctx: OperationContext, operation: string, error: PermissionDeniedError) {
  try {
    await deps.securityEvents.record({
      tenantId: ctx.tenantId,
      actorUid: ctx.actorUid,
      kind: error instanceof NotAMemberError ? 'cross-tenant-access' : 'permission-denied',
      at: deps.clock.now(),
      detail: { operation, reason: error.message },
    });
  } catch (recordError) {
    console.error('No se pudo registrar el evento de seguridad', { operation, tenantId: ctx.tenantId, recordError });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((v): v is string => typeof v === 'string' && v !== '');
}

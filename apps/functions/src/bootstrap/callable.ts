import {
  BusinessRuleError,
  type CommandResult,
  type EnvelopeErrorCode,
  type IdGenerator,
  type OperationContext,
  type Requirement,
  type TransactionScope,
  type UseCaseDependencies,
} from '@ecommerce/application';
import { HttpsError, onCall, type CallableFunction } from 'firebase-functions/https';
import { guarded, type GuardDependencies } from './guard';

export interface CallableDependencies extends GuardDependencies {
  readonly ids: IdGenerator;
}

/** Un caso de uso tal como lo declara la capa de aplicación: su clase dice qué exige. */
export interface UseCaseClass<I, O> {
  readonly requires: Requirement;
  new (deps: UseCaseDependencies): { execute(tx: TransactionScope, ctx: OperationContext, input: I): Promise<O> };
}

/**
 * Envoltura de respuesta del contrato, la misma que recibe el panel. `unauthenticated`,
 * `failed-precondition` y `permission-denied` no viajan acá sino como HttpsError: los corta la
 * guarda antes del caso de uso.
 */
export type CallableResult<O> = CommandResult<O, EnvelopeErrorCode>;

export interface CallableOptions {
  /** El caso de uso escribe bitácora en la misma transacción que el cambio (FR-030, FR-033). */
  readonly writesAudit?: boolean;
  /**
   * De dónde sale el comercio, si no del campo `tenantId`. Solo para aceptar una invitación: el
   * comercio viene en el enlace. Lo que devuelva igual pasa por la verificación de la guarda.
   */
  readonly tenantFrom?: (data: unknown) => unknown;
}

const NOT_APPLIED = 'La operación no pudo completarse y no se aplicó ningún cambio';

/**
 * Devuelve el constructor de callable de un despliegue. Cada callable es su caso de uso detrás de la
 * guarda: la clase declara el permiso, `parse` convierte la entrada y el resultado viaja en la
 * envoltura del contrato. El nombre de la callable es el de la operación que se registra.
 */
export function callableFactory(deps: CallableDependencies) {
  const useCaseDeps: UseCaseDependencies = { clock: deps.clock, ids: deps.ids };

  return function defineCallable<I, O>(
    operation: string,
    UseCase: UseCaseClass<I, O>,
    parse: (data: unknown) => I,
    options: CallableOptions = {},
  ): CallableFunction<unknown, Promise<CallableResult<O>>> {
    const useCase = new UseCase(useCaseDeps);
    return onCall({ enforceAppCheck: true }, async (request): Promise<CallableResult<O>> => {
      try {
        // Se parsea después de autorizar: a quien no puede operar no se le dice qué está mal en su pedido.
        const tenanted = options.tenantFrom ? { ...request, data: { ...(request.data as object), tenantId: options.tenantFrom(request.data) } } : request;
        const data = await guarded(tenanted, { operation, requires: UseCase.requires }, deps, (tx, ctx) =>
          useCase.execute(tx, ctx, parse(request.data)),
        );
        return { ok: true, data };
      } catch (error) {
        return failure(error, operation, options);
      }
    });
  };
}

function failure(error: unknown, operation: string, { writesAudit = false }: CallableOptions): CallableResult<never> {
  if (error instanceof BusinessRuleError) {
    return { ok: false, code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) };
  }
  if (error instanceof HttpsError || !writesAudit) throw error;
  // El cambio y su entrada se confirman en la misma transacción: si algo falló, no se aplicó ninguno.
  console.error(`${operation}: la transacción con bitácora falló`, error);
  return { ok: false, code: 'audit-write-failed', message: NOT_APPLIED };
}

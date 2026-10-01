import type { CommandFailure, CommandResult, GateErrorCode } from '@ecommerce/application';
import { httpsCallable, type Functions } from 'firebase/functions';

/**
 * Una orden al servidor. Las reglas de negocio vuelven en la envoltura del contrato; lo que corta la
 * guarda o la red llega como excepción y se normaliza al mismo resultado.
 */
export async function callCommand<T>(functions: Functions, name: string, data: object): Promise<CommandResult<T>> {
  try {
    const { data: result } = await httpsCallable<object, CommandResult<T>>(functions, name)(data);
    return result;
  } catch (error) {
    return gateFailure(error);
  }
}

const GATE_CODES: ReadonlySet<string> = new Set<GateErrorCode>(['unauthenticated', 'failed-precondition', 'permission-denied', 'unavailable', 'internal']);

/** Exportada para probarla sin emulador. `deadline-exceeded` es, para quien opera, lo mismo que sin conexión. */
export function gateFailure(error: unknown): CommandFailure<GateErrorCode> {
  const raw = (error as { code?: unknown } | null)?.code;
  const code = typeof raw === 'string' ? raw.replace(/^functions\//, '') : undefined;
  const message = error instanceof Error ? error.message : 'Falla desconocida';
  if (code === 'deadline-exceeded') return { ok: false, code: 'unavailable', message };
  if (code !== undefined && GATE_CODES.has(code)) return { ok: false, code: code as GateErrorCode, message };
  console.error('Falla inesperada al llamar al servidor', error);
  return { ok: false, code: 'internal', message };
}

import {
  BusinessRuleError,
  requirePermission,
  type OperationContext,
  type TransactionScope,
  type UseCaseDependencies,
} from '@ecommerce/application';
import { HttpsError } from 'firebase-functions/https';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callAs, harness, httpsErrorCode } from '../testing/harness';
import { callableFactory, type CallableDependencies } from './callable';

/** Un caso de uso mínimo: devuelve lo que recibe, o falla como se le pida. */
class Echo {
  static readonly requires = requirePermission('catalog.write');
  static failure: Error | undefined;

  constructor(readonly deps: UseCaseDependencies) {}

  async execute(_tx: TransactionScope, ctx: OperationContext, input: { text: string }) {
    if (Echo.failure) throw Echo.failure;
    return { text: input.text, actor: ctx.actorUid };
  }
}

function parseEcho(data: unknown): { text: string } {
  const text = (data as { text?: unknown }).text;
  if (typeof text !== 'string') throw new BusinessRuleError('invalid-argument', 'falta text', { field: 'text' });
  return { text };
}

// La envoltura de respuesta del contrato, común a todas las callable.
describe('defineCallable', () => {
  let deps: CallableDependencies;

  beforeEach(() => {
    ({ deps } = harness());
    Echo.failure = undefined;
  });

  const echo = (options = {}) => callableFactory(deps)('echo', Echo, parseEcho, options);

  it('envuelve el resultado del caso de uso en { ok: true, data }', async () => {
    await expect(echo().run(callAs('ana', { text: 'hola' }))).resolves.toEqual({ ok: true, data: { text: 'hola', actor: 'ana' } });
  });

  it('una regla de negocio vuelve como { ok: false } con el código y el detalle del contrato', async () => {
    Echo.failure = new BusinessRuleError('version-conflict', 'cambió', { expected: 1, actual: 2 });
    await expect(echo().run(callAs('ana', { text: 'hola' }))).resolves.toEqual({
      ok: false,
      code: 'version-conflict',
      message: 'cambió',
      details: { expected: 1, actual: 2 },
    });
  });

  it('una entrada mal formada vuelve como invalid-argument nombrando el campo', async () => {
    await expect(echo().run(callAs('ana', { text: 3 }))).resolves.toEqual(
      expect.objectContaining({ ok: false, code: 'invalid-argument', details: { field: 'text' } }),
    );
  });

  // Validar antes de autorizar le diría a cualquiera qué está mal en su pedido.
  it('la entrada se valida después de autorizar', async () => {
    expect(await httpsErrorCode(echo().run(callAs('desconocido', { text: 3 })))).toBe('permission-denied');
  });

  it('las precondiciones de la guarda viajan como HttpsError, no en la envoltura', async () => {
    expect(await httpsErrorCode(echo().run(callAs('desconocido', { text: 'hola' })))).toBe('permission-denied');
  });

  it('el permiso que se exige es el que declara el caso de uso', async () => {
    const authorize = vi.spyOn(deps.authorization, 'assert');
    await echo().run(callAs('ana', { text: 'hola' }));
    expect(authorize).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'catalog.write');
  });

  describe('una falla no prevista', () => {
    beforeEach(() => {
      Echo.failure = new Error('Firestore no respondió');
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    // FR-033: cambio y entrada se confirman juntos, así que si algo falla no se aplicó nada.
    it('en una operación que escribe bitácora vuelve como audit-write-failed', async () => {
      await expect(echo({ writesAudit: true }).run(callAs('ana', { text: 'hola' }))).resolves.toEqual({
        ok: false,
        code: 'audit-write-failed',
        message: expect.stringContaining('no se aplicó'),
      });
    });

    it('en cualquier otra se propaga, y Cloud Functions la informa como error interno', async () => {
      await expect(echo().run(callAs('ana', { text: 'hola' }))).rejects.toThrow('Firestore no respondió');
    });

    it('una HttpsError se propaga aunque la operación escriba bitácora', async () => {
      Echo.failure = new HttpsError('resource-exhausted', 'demasiadas');
      expect(await httpsErrorCode(echo({ writesAudit: true }).run(callAs('ana', { text: 'hola' })))).toBe('resource-exhausted');
    });
  });
});

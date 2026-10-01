import { requireAccount, requireOwner, requirePermission } from '@ecommerce/application';
import type { InMemorySecurityEventRecorder } from '@ecommerce/application/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { callRequest, harness, httpsErrorCode } from '../testing/harness';
import { guarded, type GuardDependencies } from './guard';

// T028 — la única puerta de entrada de toda mutación (FR-003, FR-004, FR-010).
describe('guarded', () => {
  let securityEvents: InMemorySecurityEventRecorder;
  let deps: GuardDependencies;
  const priceChange = { operation: 'setVariantPrice', requires: requirePermission('variant.price.write') };
  const ok = async () => 'hecho';

  beforeEach(() => {
    ({ deps, securityEvents } = harness());
  });

  describe('precondiciones, en el orden del contrato', () => {
    it('1. sin sesión → unauthenticated', async () => {
      expect(await httpsErrorCode(guarded(callRequest({}), priceChange, deps, ok))).toBe('unauthenticated');
    });

    it('2. sin App Check → failed-precondition', async () => {
      const request = callRequest({ auth: { uid: 'owner' }, app: false });
      expect(await httpsErrorCode(guarded(request, priceChange, deps, ok))).toBe('failed-precondition');
    });

    it('3. sin tenantId → invalid-argument', async () => {
      const request = callRequest({ auth: { uid: 'owner' }, data: {} });
      expect(await httpsErrorCode(guarded(request, priceChange, deps, ok))).toBe('invalid-argument');
    });

    it('3. con un tenantId que no es un único segmento → invalid-argument', async () => {
      const request = callRequest({ auth: { uid: 'owner' }, data: { tenantId: 't2/members/owner' } });
      expect(await httpsErrorCode(guarded(request, priceChange, deps, ok))).toBe('invalid-argument');
    });

    it('ninguna precondición fallida registra un evento de seguridad: no son intentos de acceso', async () => {
      await httpsErrorCode(guarded(callRequest({}), priceChange, deps, ok));
      expect(securityEvents.events).toEqual([]);
    });
  });

  describe('4 y 5. membresía y permiso, verificados contra el comercio que dice el cliente', () => {
    it('sin membresía en ese comercio → permission-denied y evento de acceso cruzado (FR-004)', async () => {
      const request = callRequest({ auth: { uid: 'ana' }, data: { tenantId: 't2' } });
      expect(await httpsErrorCode(guarded(request, priceChange, deps, ok))).toBe('permission-denied');
      expect(securityEvents.events).toEqual([
        expect.objectContaining({ tenantId: 't2', actorUid: 'ana', kind: 'cross-tenant-access' }),
      ]);
    });

    it('miembro sin el permiso → permission-denied y evento de permiso denegado', async () => {
      const request = callRequest({ auth: { uid: 'ana' } });
      expect(await httpsErrorCode(guarded(request, priceChange, deps, ok))).toBe('permission-denied');
      expect(securityEvents.events).toEqual([
        expect.objectContaining({ tenantId: 't1', kind: 'permission-denied', detail: expect.objectContaining({ operation: 'setVariantPrice' }) }),
      ]);
    });

    it('el mensaje de denegación es el mismo en ambos casos: no revela si el comercio existe', async () => {
      const errors = await Promise.all([
        guarded(callRequest({ auth: { uid: 'ana' }, data: { tenantId: 't2' } }), priceChange, deps, ok).catch((e: Error) => e.message),
        guarded(callRequest({ auth: { uid: 'ana' } }), priceChange, deps, ok).catch((e: Error) => e.message),
      ]);
      expect(errors[0]).toBe(errors[1]);
    });

    it('con el permiso, ejecuta el trabajo con el contexto verificado', async () => {
      const request = callRequest({ auth: { uid: 'ana', name: 'Ana' } });
      const catalogEdit = { operation: 'updateProductDetails', requires: requirePermission('catalog.write') };
      const ctx = await guarded(request, catalogEdit, deps, async (_tx, context) => context);
      expect(ctx).toEqual(expect.objectContaining({ tenantId: 't1', actorUid: 'ana', actorName: 'Ana' }));
    });

    // Aceptar una invitación: quien acepta todavía no es miembro; el caso de uso verifica el correo.
    it('una operación que solo exige cuenta pasa sin membresía, con el correo de la sesión en el contexto', async () => {
      const accept = { operation: 'acceptInvitation', requires: requireAccount() };
      const request = callRequest({ auth: { uid: 'nueva', email: 'nueva@correo.test' }, data: { tenantId: 't1' } });
      const ctx = await guarded(request, accept, deps, async (_tx, context) => context);
      expect(ctx).toEqual(expect.objectContaining({ actorUid: 'nueva', actorEmail: 'nueva@correo.test' }));
    });

    it('las operaciones de Propietario rechazan a cualquier otro rol', async () => {
      const teamChange = { operation: 'createRole', requires: requireOwner() };
      expect(await httpsErrorCode(guarded(callRequest({ auth: { uid: 'ana' } }), teamChange, deps, ok))).toBe('permission-denied');
      await expect(guarded(callRequest({ auth: { uid: 'owner' } }), teamChange, deps, ok)).resolves.toBe('hecho');
    });
  });

  describe('lo que no es una denegación', () => {
    it('un error del trabajo se propaga tal cual y no se registra como evento de seguridad', async () => {
      const failing = async () => {
        throw new Error('fallo del caso de uso');
      };
      await expect(guarded(callRequest({ auth: { uid: 'owner' } }), priceChange, deps, failing)).rejects.toThrow('fallo del caso de uso');
      expect(securityEvents.events).toEqual([]);
    });

    it('si registrar el evento falla, igual se deniega: nunca se convierte en un error interno', async () => {
      deps = { ...deps, securityEvents: { record: async () => { throw new Error('Firestore caído'); } } };
      expect(await httpsErrorCode(guarded(callRequest({ auth: { uid: 'ana' } }), priceChange, deps, ok))).toBe('permission-denied');
    });
  });
});

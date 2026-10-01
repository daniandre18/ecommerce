import { RoleBasedAuthorizationService } from '@ecommerce/application';
import { InMemorySecurityEventRecorder, InMemoryUnitOfWork } from '@ecommerce/application/testing';
import {
  activateMembership,
  createCatalogRole,
  createOwnerRole,
  inviteMembership,
  roleId,
  tenantId,
  uid,
  type CurrencyCode,
  type PlatformOperatorId,
  type TenantId,
} from '@ecommerce/domain';
import type { CallableRequest } from 'firebase-functions/https';
import type { CallableDependencies } from '../bootstrap/callable';

export const AT = new Date('2026-09-30T12:00:00Z');
export const T1 = tenantId('t1');

/** Solo los campos que leen la guarda y las callable; el resto de `CallableRequest` no interviene. */
export function callRequest(parts: { auth?: { uid: string; name?: string; email?: string }; app?: boolean; data?: unknown }) {
  return {
    auth: parts.auth && { uid: parts.auth.uid, token: { name: parts.auth.name, email: parts.auth.email } },
    app: parts.app === false ? undefined : { appId: 'app' },
    data: parts.data ?? { tenantId: 't1' },
  } as unknown as CallableRequest<unknown>;
}

/** Una llamada de `uid` sobre el comercio t1, con sesión y App Check. */
export const callAs = (user: string, data: Record<string, unknown> = {}) =>
  callRequest({ auth: { uid: user }, data: { tenantId: 't1', ...data } });

export function member(user: string, role: string, isOwner = false) {
  const invited = inviteMembership({ uid: uid(user), tenantId: T1, roleId: roleId(role), displayName: user, email: `${user}@t1`, at: AT });
  return { ...activateMembership(invited, AT), isOwner };
}

/**
 * El comercio t1 en memoria, en dólares, con la Propietaria `owner` y `ana` en el rol de Catálogo.
 * El resto de los comercios existe vacío: nadie es miembro.
 */
export function harness() {
  const t1 = new InMemoryUnitOfWork();
  t1.store.tenant = {
    id: T1,
    name: 'Comercio Uno',
    ownerUid: uid('owner'),
    currency: 'USD' as CurrencyCode,
    createdAt: AT,
    createdBy: 'seed' as PlatformOperatorId,
    status: 'active',
  };
  t1.store.roles.set(roleId('owner'), createOwnerRole(T1, AT));
  t1.store.roles.set(roleId('catalog'), createCatalogRole(T1, AT));
  for (const m of [member('owner', 'owner', true), member('ana', 'catalog')]) t1.store.members.set(m.uid, m);

  const securityEvents = new InMemorySecurityEventRecorder();
  let n = 0;
  const deps: CallableDependencies = {
    unitOfWorkFor: (tenant: TenantId) => (tenant === T1 ? t1 : new InMemoryUnitOfWork()),
    authorization: new RoleBasedAuthorizationService(),
    securityEvents,
    clock: { now: () => AT },
    ids: { next: () => `id-${++n}` },
  };
  return { t1, deps, securityEvents };
}

/** Código de la HttpsError con que falló la promesa, o `undefined` si no falló. */
export async function httpsErrorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

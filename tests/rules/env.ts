import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, type Firestore } from 'firebase/firestore';

export const PROJECT_ID = 'demo-ecommerce';

export function createRulesEnv(): Promise<RulesTestEnvironment> {
  const [host, port] = (process.env['FIRESTORE_EMULATOR_HOST'] ?? '127.0.0.1:8080').split(':');
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(import.meta.dirname, '../../firestore.rules'), 'utf8'),
      host: host ?? '127.0.0.1',
      port: Number(port ?? 8080),
    },
  });
}

/** El SDK de pruebas expone el tipo compat; la API modular lo acepta en tiempo de ejecución. */
export const db = (ctx: RulesTestContext) => ctx.firestore() as unknown as Firestore;

/** Identidades de la siembra. `outsider` está autenticado pero no tiene ninguna membresía. */
export const USERS = {
  owner1: 'owner1',
  catalog1: 'catalog1',
  invited1: 'invited1',
  owner2: 'owner2',
  outsider: 'outsider',
} as const;

const membership = (status: string, isOwner: boolean, roleId: string) => ({
  status,
  isOwner,
  roleId,
  displayName: 'x',
  email: 'x@test',
});

/**
 * Siembra el escenario mínimo con las reglas desactivadas: dos comercios, t1 y t2, cada uno con
 * catálogo, costos, secretos y bitácora. Toda prueba parte de este estado.
 */
export async function seed(env: RulesTestEnvironment): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = db(ctx);
    const put = (path: string, data: Record<string, unknown>) => setDoc(doc(f, path), data);

    await put('tenants/t1/members/owner1', membership('active', true, 'owner'));
    await put('tenants/t1/members/catalog1', membership('active', false, 'catalog'));
    await put('tenants/t1/members/invited1', membership('invited', false, 'catalog'));
    await put('tenants/t1/roles/catalog', {
      permissions: ['catalog.read', 'catalog.write', 'variant.stock.write'],
    });
    await put('tenants/t2/members/owner2', membership('active', true, 'owner'));

    for (const t of ['t1', 't2']) {
      await put(`tenants/${t}/products/p1`, { name: 'Camiseta', status: 'draft' });
      await put(`tenants/${t}/products/p1/variants/v1`, { sku: 'ABC-1', price: { amount: 100, currency: 'USD' } });
      await put(`tenants/${t}/products/p1/private/costs`, { costs: { v1: { amount: 40, currency: 'USD' } } });
      await put(`tenants/${t}/config/secrets`, { gatewayKey: 'sk_test' });
      await put(`tenants/${t}/config/billing`, { plan: 'x' });
      await put(`tenants/${t}/auditLog/e1`, { type: 'price.changed', actorUid: 'owner1' });
    }
  });
}

import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { createRulesEnv, db, seed, USERS } from './env';

/**
 * Prueba de regresión del defecto encontrado al implementar la fase 2.
 *
 * Las reglas tenían un `match /tenants/{tenantId}/{document=**}` con lectura para miembros. Como
 * Firestore combina con OR todas las reglas que coinciden —sin importar el orden—, ese comodín
 * concedía a CUALQUIER colaborador la lectura de credenciales de pago, facturación y bitácora,
 * aunque existiera una regla específica de "solo Propietario". Si esta prueba falla, alguien
 * volvió a introducir un comodín que se superpone con las rutas del Propietario (FR-014).
 */
describe('un colaborador activo no lee las rutas reservadas al Propietario', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => { env = await createRulesEnv(); });
  afterAll(async () => { await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env);
  });

  const catalog = () => db(env.authenticatedContext(USERS.catalog1));

  it('control: sí lee el catálogo, así que las denegaciones de abajo no son por falta de acceso', async () => {
    await assertSucceeds(getDoc(doc(catalog(), 'tenants/t1/products/p1')));
  });

  it.each([
    ['credenciales de pasarelas', 'tenants/t1/config/secrets'],
    ['facturación de la suscripción', 'tenants/t1/config/billing'],
    ['bitácora', 'tenants/t1/auditLog/e1'],
    ['costo de adquisición', 'tenants/t1/products/p1/private/costs'],
    ['membresía de otra persona', 'tenants/t1/members/owner1'],
  ])('no lee %s (%s)', async (_label, path) => {
    await assertFails(getDoc(doc(catalog(), path)));
  });

  // Caso 34 (T065): con `hasPermission` en la regla del costo, un permiso de precios no la abre.
  it('caso 34: un rol con variant.price.write y sin variant.cost.read no lee el costo', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(db(ctx), 'tenants/t1/roles/precios'), { permissions: ['catalog.read', 'variant.price.write'] });
      await setDoc(doc(db(ctx), 'tenants/t1/members/pricer1'), { uid: 'pricer1', status: 'active', roleId: 'precios', isOwner: false });
    });
    await assertFails(getDoc(doc(db(env.authenticatedContext('pricer1')), 'tenants/t1/products/p1/private/costs')));
  });

  it('sí lee su propia membresía', async () => {
    await assertSucceeds(getDoc(doc(catalog(), 'tenants/t1/members/catalog1')));
  });

  it('el Propietario sí lee todo lo anterior', async () => {
    const owner = db(env.authenticatedContext(USERS.owner1));
    for (const path of [
      'tenants/t1/config/secrets',
      'tenants/t1/config/billing',
      'tenants/t1/auditLog/e1',
      'tenants/t1/products/p1/private/costs',
      'tenants/t1/members/catalog1',
    ]) {
      await assertSucceeds(getDoc(doc(owner, path)));
    }
  });
});

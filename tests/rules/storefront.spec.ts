import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { createRulesEnv, db, membership, seed, seedExtra, USERS } from './env';

/**
 * T004 — casos 35 a 43 de specs/002-storefront-catalog/contracts/firestore-rules.md.
 *
 * Toda denegación va acompañada de un control: la misma identidad SÍ lee algo análogo. Sin él, una
 * denegación pasaría también si la regla de `storefront` no existiera, porque todo lo no declarado
 * se deniega por defecto, y la prueba no distinguiría "la regla funciona" de "no hay regla".
 */
describe('storefront y slugIndex', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => { env = await createRulesEnv(); });
  afterAll(async () => { await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env);
    const docs: Record<string, Record<string, unknown>> = {
      // Un rol de catálogo sin `catalog.read`: el caso 35a.
      'tenants/t1/roles/sinlectura': { permissions: ['catalog.write'] },
      'tenants/t1/members/sinlectura1': membership('sinlectura1', { status: 'active', roleId: 'sinlectura' }),
      'tenants/t1/members/disabled1': membership('disabled1', { status: 'disabled', roleId: 'catalog' }),
    };
    for (const t of ['t1', 't2']) {
      docs[`tenants/${t}/storefront/categoryTree`] = { nodes: {}, pendingPrune: [] };
      docs[`tenants/${t}/storefront/sections`] = { featured: ['p1'], offers: [] };
      docs[`tenants/${t}/storefront/vocabulary`] = { tags: {}, brands: {} };
      // Un documento de `storefront` que la regla no nombra: tiene que quedar cerrado (caso 41).
      docs[`tenants/${t}/storefront/otroDocumento`] = { reservado: true };
      docs[`tenants/${t}/slugIndex/camiseta`] = { productId: 'p1', kind: 'current' };
      docs[`tenants/${t}/categorySlugs/prendas`] = { categoryId: 'ropa' };
      docs[`tenants/${t}/gtinIndex/00012345678905`] = { productId: 'p1', variantId: 'v1' };
    }
    await seedExtra(env, docs);
  });

  const as = (user: string) => db(env.authenticatedContext(user));
  const read = (user: string, path: string) => getDoc(doc(as(user), path));

  it('caso 35: un miembro activo lee el árbol, las secciones y el vocabulario de su comercio', async () => {
    for (const name of ['categoryTree', 'sections', 'vocabulary']) {
      await assertSucceeds(read(USERS.catalog1, `tenants/t1/storefront/${name}`));
    }
  });

  it('caso 35a: un miembro cuyo rol no tiene catalog.read también los lee', async () => {
    // Fija el comportamiento actual a la espera de la decisión pendiente sobre catalog.read (T102 de
    // la 001). No significa que el modelo esté cerrado: si esa decisión exige el permiso, este caso
    // cambia a denegado.
    for (const name of ['categoryTree', 'sections', 'vocabulary']) {
      await assertSucceeds(read('sinlectura1', `tenants/t1/storefront/${name}`));
    }
  });

  it('caso 36: no lee el árbol de otro comercio, aunque sí el del suyo', async () => {
    await assertSucceeds(read(USERS.catalog1, 'tenants/t1/storefront/categoryTree'));
    await assertFails(read(USERS.catalog1, 'tenants/t2/storefront/categoryTree'));
  });

  it('caso 37: no lee las secciones de otro comercio, aunque sí las del suyo', async () => {
    await assertSucceeds(read(USERS.catalog1, 'tenants/t1/storefront/sections'));
    await assertFails(read(USERS.catalog1, 'tenants/t2/storefront/sections'));
  });

  it('caso 38: no lee una URL reservada de otro comercio, aunque sí las del suyo', async () => {
    await assertSucceeds(read(USERS.catalog1, 'tenants/t1/slugIndex/camiseta'));
    await assertFails(read(USERS.catalog1, 'tenants/t2/slugIndex/camiseta'));
  });

  it('caso 39: una membresía dada de baja no lee el árbol que un miembro activo sí lee', async () => {
    await assertSucceeds(read(USERS.catalog1, 'tenants/t1/storefront/categoryTree'));
    await assertFails(read('disabled1', 'tenants/t1/storefront/categoryTree'));
  });

  it('caso 40: una cuenta en dos comercios lee el árbol de los dos, cada uno por su membresía', async () => {
    await assertSucceeds(read(USERS.multi1, 'tenants/t1/storefront/categoryTree'));
    await assertSucceeds(read(USERS.multi1, 'tenants/t2/storefront/categoryTree'));
  });

  it('caso 41: un documento de storefront que la regla no nombra queda cerrado', async () => {
    await assertSucceeds(read(USERS.catalog1, 'tenants/t1/storefront/sections'));
    await assertFails(read(USERS.catalog1, 'tenants/t1/storefront/otroDocumento'));
  });

  it('caso 42: slugIndex se lee de a un documento, pero no se lista', async () => {
    await assertSucceeds(read(USERS.catalog1, 'tenants/t1/slugIndex/camiseta'));
    await assertFails(getDocs(collection(as(USERS.catalog1), 'tenants/t1/slugIndex')));
  });

  it('caso 43: gtinIndex no se lee, aunque slugIndex sí', async () => {
    await assertSucceeds(read(USERS.owner1, 'tenants/t1/slugIndex/camiseta'));
    await assertFails(read(USERS.owner1, 'tenants/t1/gtinIndex/00012345678905'));
  });

  // T110: las URL anteriores de las categorías, fuera del árbol. El panel muestra si una está libre
  // antes de guardar: las lee de a una, como slugIndex.
  it('caso 49: un miembro activo lee una URL anterior de categoría de su comercio, de a una', async () => {
    await assertSucceeds(read(USERS.catalog1, 'tenants/t1/categorySlugs/prendas'));
    await assertFails(getDocs(collection(as(USERS.catalog1), 'tenants/t1/categorySlugs')));
  });

  it('caso 50: no lee las de otro comercio, ni con la membresía dada de baja', async () => {
    await assertFails(read(USERS.catalog1, 'tenants/t2/categorySlugs/prendas'));
    await assertFails(read('disabled1', 'tenants/t1/categorySlugs/prendas'));
  });
});

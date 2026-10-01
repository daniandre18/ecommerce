import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRulesEnv, db, seed, USERS } from './env';

// T037 — las lecturas del catálogo van directas del cliente a Firestore (no hay callable de
// lectura), así que estas reglas son la única barrera: membresía ACTIVA en ESE comercio.
describe('lectura del catálogo', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => { env = await createRulesEnv(); });
  afterAll(async () => { await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env);
  });

  const as = (user: string) => db(env.authenticatedContext(user));

  describe('un miembro activo de su comercio', () => {
    // Caso 35: el panel necesita el nombre y la moneda del comercio para mostrar y cargar importes.
    it('lee el documento del comercio', async () => {
      await assertSucceeds(getDoc(doc(as(USERS.catalog1), 'tenants/t1')));
    });

    it('no lee el documento de otro comercio', async () => {
      await assertFails(getDoc(doc(as(USERS.catalog1), 'tenants/t2')));
    });

    it('lee un producto y sus variantes', async () => {
      await assertSucceeds(getDoc(doc(as(USERS.catalog1), 'tenants/t1/products/p1')));
      await assertSucceeds(getDoc(doc(as(USERS.catalog1), 'tenants/t1/products/p1/variants/v1')));
    });

    // El listado de la interfaz es una consulta, y las reglas evalúan consultas aparte de lecturas sueltas.
    it('lista los productos y las variantes de un producto', async () => {
      const products = await assertSucceeds(getDocs(collection(as(USERS.catalog1), 'tenants/t1/products')));
      expect(products.size).toBe(1);
      const variants = await assertSucceeds(getDocs(collection(as(USERS.catalog1), 'tenants/t1/products/p1/variants')));
      expect(variants.size).toBe(1);
    });

    it('no lista los productos de otro comercio', async () => {
      await assertFails(getDocs(collection(as(USERS.catalog1), 'tenants/t2/products')));
    });
  });

  // Caso 19 (FR-015). Que el código nunca escriba el costo en la variante lo prueba
  // libs/infrastructure/src/firestore/catalog.integration.spec.ts; acá, que el rol no lo alcanza.
  it('el rol de Catálogo lee la variante, que no trae el costo, y no lee el documento del costo', async () => {
    const variant = await assertSucceeds(getDoc(doc(as(USERS.catalog1), 'tenants/t1/products/p1/variants/v1')));
    expect(Object.keys(variant.data() ?? {})).not.toContain('cost');
    await assertFails(getDoc(doc(as(USERS.catalog1), 'tenants/t1/products/p1/private/costs')));
  });

  describe('sin membresía activa no se lee nada', () => {
    it.each([
      ['una invitación sin aceptar', USERS.invited1],
      ['una cuenta sin membresía', USERS.outsider],
    ])('%s', async (_label, user) => {
      await assertFails(getDoc(doc(as(user), 'tenants/t1')));
      await assertFails(getDoc(doc(as(user), 'tenants/t1/products/p1')));
      await assertFails(getDocs(collection(as(user), 'tenants/t1/products')));
    });

    it('sin sesión', async () => {
      await assertFails(getDoc(doc(db(env.unauthenticatedContext()), 'tenants/t1/products/p1')));
    });

    // FR-008a: las reglas leen la membresía en cada lectura, así que la baja no espera a que venza un token.
    it('la baja de la membresía corta la lectura en la solicitud siguiente', async () => {
      await assertSucceeds(getDoc(doc(as(USERS.catalog1), 'tenants/t1/products/p1')));
      await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(db(ctx), 'tenants/t1/members/catalog1'), { status: 'disabled' }));
      await assertFails(getDoc(doc(as(USERS.catalog1), 'tenants/t1/products/p1')));
    });
  });
});

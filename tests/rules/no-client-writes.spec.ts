import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { createRulesEnv, db, seed, USERS } from './env';

// T017 — casos 24, 25 y 27. Ninguna escritura sale del cliente: todas pasan por Cloud Functions.
describe('ninguna escritura desde el cliente', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => { env = await createRulesEnv(); });
  afterAll(async () => { await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env);
  });

  const as = (user: string) => db(env.authenticatedContext(user));

  it('caso 24: el colaborador de catálogo no escribe un producto directo', async () => {
    await assertFails(updateDoc(doc(as(USERS.catalog1), 'tenants/t1/products/p1'), { name: 'x' }));
  });

  // La prueba de que el rol de catálogo no escribe precios ni evitando la interfaz (FR-013).
  it('caso 25: el colaborador de catálogo no escribe el precio de una variante', async () => {
    await assertFails(
      updateDoc(doc(as(USERS.catalog1), 'tenants/t1/products/p1/variants/v1'), {
        price: { amount: 1, currency: 'USD' },
      }),
    );
  });

  it('caso 27: ni el Propietario escribe un producto desde el cliente', async () => {
    await assertFails(setDoc(doc(as(USERS.owner1), 'tenants/t1/products/p2'), { name: 'x' }));
  });

  // Casos 45 a 48 (002). Cada uno con un control de lectura: la misma identidad SÍ lee ese
  // documento, así la denegación es de la escritura y no de falta de acceso. Lo que estos casos
  // fijan ya lo garantizaba la 001 —ninguna regla concede escritura—, así que se verificaron por
  // mutación: con una concesión de escritura agregada a propósito, cada uno se pone en rojo.
  describe('storefront, índices y condiciones de venta (002)', () => {
    beforeEach(async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(db(ctx), 'tenants/t1/storefront/sections'), { featured: [], offers: [] });
        await setDoc(doc(db(ctx), 'tenants/t1/storefront/categoryTree'), { nodes: {}, pendingPrune: [] });
        await setDoc(doc(db(ctx), 'tenants/t1/slugIndex/camiseta'), { productId: 'p1', kind: 'current' });
      });
    });

    it('caso 45: ni el Propietario agrega un producto a una sección desde el cliente', async () => {
      await assertSucceeds(getDoc(doc(as(USERS.owner1), 'tenants/t1/storefront/sections')));
      await assertFails(
        updateDoc(doc(as(USERS.owner1), 'tenants/t1/storefront/sections'), { offers: ['p1'] }),
      );
    });

    it('caso 46: ni el Propietario escribe el árbol de categorías desde el cliente', async () => {
      await assertSucceeds(getDoc(doc(as(USERS.owner1), 'tenants/t1/storefront/categoryTree')));
      await assertFails(
        updateDoc(doc(as(USERS.owner1), 'tenants/t1/storefront/categoryTree'), { nodes: { c1: { name: 'x' } } }),
      );
    });

    it('caso 47: ni el Propietario reserva una URL o un GTIN desde el cliente', async () => {
      await assertSucceeds(getDoc(doc(as(USERS.owner1), 'tenants/t1/slugIndex/camiseta')));
      await assertFails(setDoc(doc(as(USERS.owner1), 'tenants/t1/slugIndex/otra'), { productId: 'p1', kind: 'current' }));
      await assertFails(setDoc(doc(as(USERS.owner1), 'tenants/t1/gtinIndex/00012345678905'), { productId: 'p1' }));
    });

    it('caso 48: el rol de Catálogo no cambia la visibilidad del precio ni el envío gratis', async () => {
      await assertSucceeds(getDoc(doc(as(USERS.catalog1), 'tenants/t1/products/p1')));
      await assertFails(updateDoc(doc(as(USERS.catalog1), 'tenants/t1/products/p1'), { priceVisible: false }));
      await assertFails(updateDoc(doc(as(USERS.catalog1), 'tenants/t1/products/p1'), { freeShipping: true }));
    });
  });

  it('nadie puede fabricarse una membresía', async () => {
    await assertFails(
      setDoc(doc(as(USERS.outsider), 'tenants/t1/members/outsider'), {
        status: 'active',
        isOwner: true,
        roleId: 'owner',
      }),
    );
  });
});

import type { ProductListQuery, Watcher } from '@ecommerce/application';
import {
  activateMembership,
  inviteMembership,
  normalizeName,
  productId,
  roleId,
  storefrontDefaults,
  tenantId,
  uid,
  type FeaturedSections,
  type Product,
  type ProductId,
} from '@ecommerce/domain';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, terminate } from 'firebase/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth as adminAuth } from '../firebase-app';
import { firestore } from '../firestore/firestore';
import { FirestoreUnitOfWork } from '../firestore/unit-of-work';
import { clearFirestoreEmulator } from '../testing/emulator';
import { FirebaseSession } from './firebase-session';
import { FirestoreCatalogQueries } from './firestore-catalog-queries';

const T1 = tenantId('t1');
const AT = new Date('2026-09-30T12:00:00Z');
const OWNER = { uid: 'sec-owner', email: 'sec-owner@t1.test', password: 'test-1234' };

function emulatorHost(variable: string): string {
  const host = process.env[variable];
  if (!host) throw new Error(`${variable} no definido: correr con firebase emulators:exec --only auth,firestore`);
  return host;
}

const id = (n: number): ProductId => productId(`s${String(n).padStart(2, '0')}`);

/** `s00`…`s39`, editados en ese orden: `s39` es el más reciente. Los múltiplos de 5, activos. */
const product = (n: number, overrides: Partial<Product> = {}): Product => ({
  ...storefrontDefaults(),
  id: id(n),
  tenantId: T1,
  name: `Producto ${n}`,
  nameNormalized: normalizeName(`Producto ${n}`),
  description: '',
  images: [],
  options: [],
  status: n % 5 === 0 ? 'active' : 'draft',
  archived: false,
  variantCount: 1,
  hasIncompleteVariants: true,
  createdAt: AT,
  updatedAt: new Date(AT.getTime() + n * 60_000),
  version: 1,
  ...overrides,
});

const OFFERS = Array.from({ length: 40 }, (_, n) => id(n));

function first<T>(subscribe: (watcher: Watcher<T>) => () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const unsubscribe = subscribe({
      next: (value) => {
        resolve(value);
        queueMicrotask(unsubscribe);
      },
      error: reject,
    });
  });
}

// T078 — Historia 3, FR-027c: el listado filtrado por sección lee los ids del documento de secciones
// y los pide con `documentId in`, que admite hasta 30: una sección llena son dos consultas.
describe('filtro del listado por sección destacada', () => {
  const app = initializeApp({ projectId: 'demo-ecommerce', apiKey: 'demo-key' }, 'filtro-por-seccion');
  const webAuth = getAuth(app);
  const webDb = getFirestore(app);
  const queries = new FirestoreCatalogQueries(webDb);

  beforeAll(async () => {
    connectAuthEmulator(webAuth, `http://${emulatorHost('FIREBASE_AUTH_EMULATOR_HOST')}`, { disableWarnings: true });
    const [host, port] = emulatorHost('FIRESTORE_EMULATOR_HOST').split(':');
    connectFirestoreEmulator(webDb, host ?? '127.0.0.1', Number(port));

    await clearFirestoreEmulator();
    await adminAuth()
      .getUser(OWNER.uid)
      .catch(() => adminAuth().createUser(OWNER));
    const db = firestore();
    await db.doc('tenants/t1').set({ name: 'Comercio Uno', ownerUid: OWNER.uid, currency: 'USD', createdAt: AT, createdBy: 'seed', status: 'active' });
    await new FirestoreUnitOfWork(db, T1).run(async (tx) => {
      const invited = inviteMembership({ uid: uid(OWNER.uid), tenantId: T1, roleId: roleId('owner'), displayName: 'Dueña', email: OWNER.email, at: AT });
      await tx.members.save({ ...activateMembership(invited, AT), isOwner: true });
      for (let n = 0; n < 40; n++) await tx.products.save(product(n));
      // Uno fuera de la sección, más reciente que todos: no aparece.
      await tx.products.save(product(99, { id: productId('fuera'), updatedAt: new Date(AT.getTime() + 999 * 60_000) }));
      await tx.sections.save({ featured: [id(3), id(1)], offers: OFFERS });
    });
    await expect(new FirebaseSession(webAuth).signIn(OWNER.email, OWNER.password)).resolves.toEqual(expect.objectContaining({ ok: true }));
  });

  afterAll(async () => {
    await terminate(webDb);
    await deleteApp(app);
  });

  const listed = (request: ProductListQuery) =>
    first<readonly Product[]>((watcher) => queries.watchProducts(T1, request, watcher)).then((products) => products.map((p) => p.id as string));

  it('las secciones llegan a quien lee el catálogo, con sus listas en orden', async () => {
    const sections = await first<FeaturedSections>((watcher) => queries.watchSections(T1, watcher));
    expect(sections).toEqual({ featured: ['s03', 's01'], offers: OFFERS });
  });

  it('una sección llena —40 ids, dos consultas— trae los suyos por edición, cortados a la página', async () => {
    expect(await listed({ productIds: OFFERS, limit: 25 })).toEqual(Array.from({ length: 25 }, (_, i) => `s${39 - i}`));
    expect(await listed({ productIds: OFFERS, limit: 50 })).toHaveLength(40);
  });

  it('una sección chica es una sola consulta, con el mismo orden', async () => {
    expect(await listed({ productIds: [id(3), id(1)], limit: 25 })).toEqual(['s03', 's01']);
  });

  it('junto con el estado', async () => {
    expect(await listed({ productIds: OFFERS, status: 'active', limit: 25 })).toEqual(['s35', 's30', 's25', 's20', 's15', 's10', 's05', 's00']);
  });

  it('una sección vacía es una lista vacía, sin consultar', async () => {
    expect(await listed({ productIds: [], limit: 25 })).toEqual([]);
  });
});

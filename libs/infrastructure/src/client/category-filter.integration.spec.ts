import type { ProductListQuery, Watcher } from '@ecommerce/application/client';
import {
  activateMembership,
  categoryId,
  createCategory,
  descendantsOf,
  emptyCategoryTree,
  inviteMembership,
  normalizeName,
  productId,
  roleId,
  setCategoryHidden,
  storefrontDefaults,
  tenantId,
  uid,
  type CategoryId,
  type CategoryTree,
  type Product,
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
const OWNER = { uid: 'cat-owner', email: 'cat-owner@t1.test', password: 'test-1234' };

function emulatorHost(variable: string): string {
  const host = process.env[variable];
  if (!host) throw new Error(`${variable} no definido: correr con firebase emulators:exec --only auth,firestore`);
  return host;
}

const cid = (value: string): CategoryId => categoryId(value);
const sub = (root: string, i: number) => `${root}-${String(i).padStart(2, '0')}`;

/**
 * "grande": una raíz con 40 subcategorías → su rama son 41 ids, dos consultas de 30 y 11.
 * "chica": una raíz con 4 → 5 ids, una sola consulta. "otra", fuera de las dos ramas.
 */
function seedTree(): CategoryTree {
  let tree = emptyCategoryTree();
  for (const [root, children] of [['grande', 40], ['chica', 4]] as const) {
    tree = createCategory(tree, { id: cid(root), parentId: null, name: root });
    for (let i = 0; i < children; i++) tree = createCategory(tree, { id: cid(sub(root, i)), parentId: cid(root), name: sub(root, i) });
  }
  tree = createCategory(tree, { id: cid('otra'), parentId: null, name: 'otra' });
  // Una raíz oculta con una hija oculta por sí misma y otra visible: lo leído tiene que traer la
  // visibilidad PROPIA de cada una, sin derivarla ni propagarla (FR-021a).
  tree = setCategoryHidden(tree, cid(sub('chica', 1)), true);
  return setCategoryHidden(tree, cid('chica'), true);
}

const product = (id: string, minute: number, categories: string[], overrides: Partial<Product> = {}): Product => ({
  ...storefrontDefaults(),
  id: productId(id),
  tenantId: T1,
  name: id,
  nameNormalized: normalizeName(id),
  description: '',
  images: [],
  options: [],
  status: 'draft',
  archived: false,
  variantCount: 1,
  hasIncompleteVariants: true,
  createdAt: AT,
  updatedAt: new Date(AT.getTime() + minute * 60_000),
  version: 1,
  categoryIds: categories.map(cid),
  ...overrides,
});

/**
 * Los mismos casos en las dos ramas. En la grande, `sub-00` y `sub-01` caen en la primera consulta
 * (con la raíz, los primeros 30 ids) y `sub-35`, `sub-38` y `sub-39` en la segunda.
 */
function productsOf(root: string, [first, second, third, fourth, fifth]: readonly string[]): Product[] {
  const p = (id: string) => `${root}-${id}`;
  return [
    product(p('a'), 1, [first as string]),
    product(p('b'), 5, [second as string]),
    // En dos categorías de la rama, de consultas distintas en la grande: aparece una sola vez.
    product(p('c'), 3, [third as string, fourth as string]),
    product(p('d'), 2, [root]),
    product(p('g'), 4, [fifth as string]),
    // Fuera de la rama, y archivado: no aparecen.
    product(p('e'), 6, ['otra']),
    product(p('f'), 7, [first as string], { archived: true }),
  ];
}

/** El primer valor que entrega una suscripción, o su error. */
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

// T049 — Historia 2: filtrar por una categoría incluye a sus subcategorías (FR-023). Firestore admite
// hasta 30 valores en `array-contains-any`: una rama más grande se parte en consultas que se combinan
// en el cliente (research §2). Contra el emulador, a través de las reglas.
describe('filtro del listado por una rama de categorías', () => {
  const app = initializeApp({ projectId: 'demo-ecommerce', apiKey: 'demo-key' }, 'filtro-por-categoria');
  const webAuth = getAuth(app);
  const webDb = getFirestore(app);
  const queries = new FirestoreCatalogQueries(webDb);
  const tree = seedTree();

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
      await tx.categories.save(tree);
      for (const p of [
        ...productsOf('grande', [sub('grande', 0), sub('grande', 35), sub('grande', 1), sub('grande', 38), sub('grande', 39)]),
        ...productsOf('chica', [sub('chica', 0), sub('chica', 3), sub('chica', 1), sub('chica', 2), sub('chica', 3)]),
      ]) {
        await tx.products.save(p);
      }
    });
    await expect(new FirebaseSession(webAuth).signIn(OWNER.email, OWNER.password)).resolves.toEqual(expect.objectContaining({ ok: true }));
  });

  afterAll(async () => {
    await terminate(webDb);
    await deleteApp(app);
  });

  const branch = (root: string) => [cid(root), ...descendantsOf(tree, cid(root))];
  const names = (request: ProductListQuery) =>
    first<readonly Product[]>((watcher) => queries.watchProducts(T1, request, watcher)).then((products) => products.map((p) => p.name));

  it('la rama grande son 41 ids: más de lo que admite una consulta', () => {
    expect(branch('grande')).toHaveLength(41);
    expect(branch('chica')).toHaveLength(5);
  });

  it.each(['grande', 'chica'])('rama %s: aparecen los de la raíz y de todas sus subcategorías, una vez, por edición', async (root) => {
    expect(await names({ categoryIds: branch(root), limit: 20 })).toEqual(['b', 'g', 'c', 'd', 'a'].map((id) => `${root}-${id}`));
  });

  it.each(['grande', 'chica'])('rama %s: cortada al tamaño de página después de combinar', async (root) => {
    expect(await names({ categoryIds: branch(root), limit: 3 })).toEqual(['b', 'g', 'c'].map((id) => `${root}-${id}`));
  });

  it('una subcategoría sola: solo lo suyo', async () => {
    expect(await names({ categoryIds: [cid(sub('grande', 38))], limit: 20 })).toEqual(['grande-c']);
  });

  it('junto con el estado', async () => {
    expect(await names({ categoryIds: branch('grande'), status: 'active', limit: 20 })).toEqual([]);
    expect(await names({ categoryIds: branch('grande'), status: 'draft', limit: 2 })).toEqual(['grande-b', 'grande-g']);
  });

  it('el árbol llega a quien lee el catálogo, con su visibilidad propia', async () => {
    const read = await first<CategoryTree>((watcher) => queries.watchCategoryTree(T1, watcher));
    expect(read).toEqual(tree);
    expect([read.nodes[cid('chica')]?.hidden, read.nodes[cid(sub('chica', 0))]?.hidden, read.nodes[cid(sub('chica', 1))]?.hidden]).toEqual([true, false, true]);
  });

  it('cuántos productos tienen una categoría, para el aviso previo a eliminarla (FR-024)', async () => {
    await expect(queries.countInCategory(T1, cid(sub('grande', 0)))).resolves.toBe(2);
    await expect(queries.countInCategory(T1, cid('otra'))).resolves.toBe(2);
    await expect(queries.countInCategory(T1, cid('nada'))).resolves.toBe(0);
  });
});

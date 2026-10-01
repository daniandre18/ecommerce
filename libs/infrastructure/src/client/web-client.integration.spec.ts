import type { ProductListQuery, Watcher } from '@ecommerce/application';
import {
  activateMembership,
  createIncompleteVariant,
  inviteMembership,
  optionId,
  normalizeName,
  productId,
  roleId,
  tenantId,
  uid,
  valueId,
  variantId,
  type Product,
  type ProductStatus,
  type Variant,
} from '@ecommerce/domain';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, terminate } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth as adminAuth } from '../firebase-app';
import { firestore } from '../firestore/firestore';
import { FirestoreUnitOfWork } from '../firestore/unit-of-work';
import { clearFirestoreEmulator } from '../testing/emulator';
import { FirebaseImageStorage } from './firebase-image-storage';
import { FirebaseSession } from './firebase-session';
import { FirestoreCatalogQueries } from './firestore-catalog-queries';

const T1 = tenantId('t1');
const AT = new Date('2026-09-30T12:00:00Z');
const OWNER = { uid: 'cli-owner', email: 'cli-owner@t1.test', password: 'test-1234' };
const OUTSIDER = { uid: 'cli-outsider', email: 'cli-outsider@test', password: 'test-1234' };

function emulatorHost(variable: string): string {
  const host = process.env[variable];
  if (!host) throw new Error(`${variable} no definido: correr con firebase emulators:exec --only auth,firestore`);
  return host;
}

async function ensureAccount(account: typeof OWNER): Promise<void> {
  await adminAuth().getUser(account.uid).catch(() => adminAuth().createUser(account));
}

const product = (id: string, name: string, minute: number, overrides: Partial<Product> = {}): Product => ({
  id: productId(id),
  tenantId: T1,
  name,
  nameNormalized: normalizeName(name),
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
  ...overrides,
});

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

// El panel lee con el SDK web, a través de las reglas, y reconstruye con los mapeadores compartidos.
describe('cliente web contra los emuladores', () => {
  const app = initializeApp({ projectId: 'demo-ecommerce', apiKey: 'demo-key' }, 'cliente-de-prueba');
  const webAuth = getAuth(app);
  const webDb = getFirestore(app);
  const session = new FirebaseSession(webAuth);
  const queries = new FirestoreCatalogQueries(webDb);

  beforeAll(async () => {
    connectAuthEmulator(webAuth, `http://${emulatorHost('FIREBASE_AUTH_EMULATOR_HOST')}`, { disableWarnings: true });
    const [host, port] = emulatorHost('FIRESTORE_EMULATOR_HOST').split(':');
    connectFirestoreEmulator(webDb, host ?? '127.0.0.1', Number(port));

    await clearFirestoreEmulator();
    await Promise.all([ensureAccount(OWNER), ensureAccount(OUTSIDER)]);
    const db = firestore();
    await db.doc('tenants/t1').set({ name: 'Comercio Uno', ownerUid: OWNER.uid, currency: 'USD', createdAt: AT, createdBy: 'seed', status: 'active' });
    await new FirestoreUnitOfWork(db, T1).run(async (tx) => {
      const invited = inviteMembership({ uid: uid(OWNER.uid), tenantId: T1, roleId: roleId('owner'), displayName: 'Dueña', email: OWNER.email, at: AT });
      await tx.members.save({ ...activateMembership(invited, AT), isOwner: true });
      const color = { id: optionId('color'), name: 'Color', position: 0, values: [{ id: valueId('rojo'), label: 'Rojo', position: 0 }] };
      const variant = (id: string, archived: boolean) => ({
        ...createIncompleteVariant({ id: variantId(id), tenantId: T1, productId: productId('p1'), optionValues: { [color.id]: color.values[0]!.id } }),
        archived,
        version: 1,
      });
      await tx.variants.save(variant('v-viva', false));
      await tx.variants.save(variant('v-archivada', true));
      for (const p of [
        product('p1', 'Camiseta', 1, { options: [color] }),
        product('p2', 'Café con leche', 3, { status: 'active' }),
        product('p3', 'Taza', 2),
        product('p4', 'Cafetera vieja', 4, { archived: true }),
      ]) {
        await tx.products.save(p);
      }
    });
  });

  afterAll(async () => {
    await terminate(webDb);
    await deleteApp(app);
  });

  const names = (request: ProductListQuery) =>
    first<readonly Product[]>((watcher) => queries.watchProducts(T1, request, watcher)).then((products) => products.map((p) => p.name));

  describe('sesión', () => {
    it('una contraseña equivocada no inicia sesión, sin decir si el correo existe', async () => {
      await expect(session.signIn(OWNER.email, 'otra')).resolves.toEqual({ ok: false, reason: 'invalid-credentials' });
      await expect(session.signIn('nadie@test', 'otra')).resolves.toEqual({ ok: false, reason: 'invalid-credentials' });
    });

    it('con las credenciales correctas, la sesión queda abierta', async () => {
      await expect(session.signIn(OWNER.email, OWNER.password)).resolves.toEqual(
        expect.objectContaining({ ok: true, user: expect.objectContaining({ uid: OWNER.uid }) }),
      );
      await expect(session.current()).resolves.toEqual(expect.objectContaining({ uid: OWNER.uid, email: OWNER.email }));
    });
  });

  describe('lecturas de un miembro activo', () => {
    beforeAll(async () => {
      await session.signIn(OWNER.email, OWNER.password);
    });

    it('el comercio llega con su nombre y su moneda', async () => {
      const tenant = await first((watcher) => queries.watchTenant(T1, watcher));
      expect(tenant).toEqual(expect.objectContaining({ id: 't1', name: 'Comercio Uno', currency: 'USD' }));
    });

    it('el listado excluye los archivados y pone primero lo editado más recientemente', async () => {
      await expect(names({ limit: 10 })).resolves.toEqual(['Café con leche', 'Taza', 'Camiseta']);
    });

    it('la búsqueda es por prefijo, sin acentos ni mayúsculas', async () => {
      await expect(names({ search: 'CAFE', limit: 10 })).resolves.toEqual(['Café con leche']);
    });

    it.each<[ProductStatus, string[]]>([
      ['active', ['Café con leche']],
      ['draft', ['Taza', 'Camiseta']],
    ])('filtra por estado %s', async (status, expected) => {
      await expect(names({ status, limit: 10 })).resolves.toEqual(expected);
    });

    it('respeta el tope pedido', async () => {
      await expect(names({ limit: 2 })).resolves.toEqual(['Café con leche', 'Taza']);
    });

    it('un producto llega con sus opciones; uno que no existe, como null', async () => {
      const found = await first<Product | null>((watcher) => queries.watchProduct(T1, productId('p1'), watcher));
      expect(found?.options.map((o) => o.values.map((v) => v.label))).toEqual([['Rojo']]);
      await expect(first<Product | null>((watcher) => queries.watchProduct(T1, productId('no-existe'), watcher))).resolves.toBeNull();
    });

    it('las variantes llegan sin las archivadas, con existencias sin definir y no en cero', async () => {
      const variants = await first<readonly Variant[]>((watcher) => queries.watchVariants(T1, productId('p1'), watcher));
      expect(variants.map((v) => [v.id, v.stock])).toEqual([['v-viva', { kind: 'undefined' }]]);
    });
  });

  // Otra instancia, como otro navegador: la caché local de Firestore no se separa por cuenta, así
  // que en la misma instancia el primer valor podría salir de lo que leyó la cuenta anterior. Por
  // eso el panel recarga la página al cerrar sesión.
  describe('imágenes', () => {
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
    const images = () => {
      const storage = getStorage(app, 'gs://demo-ecommerce.appspot.com');
      const [host, port] = emulatorHost('FIREBASE_STORAGE_EMULATOR_HOST').split(':');
      connectStorageEmulator(storage, host ?? '127.0.0.1', Number(port));
      return new FirebaseImageStorage(storage);
    };
    let storage: FirebaseImageStorage;

    beforeAll(async () => {
      storage = images();
      await session.signIn(OWNER.email, OWNER.password);
    });

    it('sube con un nombre nuevo cada vez, en la carpeta del producto, informando el avance', async () => {
      const progress: number[] = [];
      const [first, second] = [
        await storage.upload({ tenantId: T1, productId: productId('p1'), file: png, onProgress: (fraction) => progress.push(fraction) }),
        await storage.upload({ tenantId: T1, productId: productId('p1'), file: png }),
      ];
      expect(first).toEqual({ ok: true, storagePath: expect.stringMatching(/^tenants\/t1\/products\/p1\/images\/[0-9a-f-]+\.png$/) });
      expect(second.ok && first.ok && second.storagePath !== first.storagePath).toBe(true);
      expect(progress.at(-1)).toBe(1);
    });

    it('lo subido se puede mostrar', async () => {
      const uploaded = await storage.upload({ tenantId: T1, productId: productId('p1'), file: png });
      if (!uploaded.ok) throw new Error('No se subió');
      await expect(storage.displayUrl(uploaded.storagePath)).resolves.toMatch(/^http/);
    });

    it('un archivo que no es imagen lo rechazan las reglas del servidor', async () => {
      const html = new Blob(['<script></script>'], { type: 'text/html' });
      await expect(storage.upload({ tenantId: T1, productId: productId('p1'), file: html })).resolves.toEqual({ ok: false, reason: 'not-allowed' });
    });
  });

  it('sin membresía en el comercio, la lectura llega como error y no como lista vacía', async () => {
    const other = initializeApp({ projectId: 'demo-ecommerce', apiKey: 'demo-key' }, 'otro-navegador');
    const otherAuth = getAuth(other);
    const otherDb = getFirestore(other);
    connectAuthEmulator(otherAuth, `http://${emulatorHost('FIREBASE_AUTH_EMULATOR_HOST')}`, { disableWarnings: true });
    const [host, port] = emulatorHost('FIRESTORE_EMULATOR_HOST').split(':');
    connectFirestoreEmulator(otherDb, host ?? '127.0.0.1', Number(port));
    try {
      await new FirebaseSession(otherAuth).signIn(OUTSIDER.email, OUTSIDER.password);
      const watch = (watcher: Watcher<readonly Product[]>) => new FirestoreCatalogQueries(otherDb).watchProducts(T1, { limit: 10 }, watcher);
      await expect(first(watch)).rejects.toMatchObject({ code: 'permission-denied' });
    } finally {
      await terminate(otherDb);
      await deleteApp(other);
    }
  });
});

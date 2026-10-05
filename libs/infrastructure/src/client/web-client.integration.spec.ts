import type { AuditCursor, AuditFilter, ProductListQuery, TenantAccess, Watcher } from '@ecommerce/application';
import {
  activateMembership,
  auditEntryId,
  batchId,
  buildAuditEntries,
  buildTeamAuditEntry,
  createIncompleteVariant,
  createCatalogRole,
  createInvitation,
  invitationId,
  inviteMembership,
  presetRoles,
  revokeInvitation,
  money,
  optionId,
  normalizeName,
  slug,
  storefrontDefaults,
  productId,
  roleId,
  tenantId,
  uid,
  valueId,
  variantId,
  type AuditEntry,
  type Invitation,
  type MemberAccess,
  type Membership,
  type Money,
  type Product,
  type ProductStatus,
  type Role,
  type Variant,
  type VariantId,
} from '@ecommerce/domain';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, disableNetwork, doc, enableNetwork, getFirestore, terminate } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auth as adminAuth } from '../firebase-app';
import { firestore } from '../firestore/firestore';
import { FirestoreUnitOfWork } from '../firestore/unit-of-work';
import { clearFirestoreEmulator } from '../testing/emulator';
import { FirebaseImageStorage } from './firebase-image-storage';
import { FirebaseSession } from './firebase-session';
import { FirestoreAuditQueries } from './firestore-audit-queries';
import { FirestoreCatalogQueries } from './firestore-catalog-queries';
import { FirestoreTeamQueries } from './firestore-team-queries';
import { FirestoreTenantDirectory } from './firestore-tenant-directory';
import { listenToDoc, OfflineError } from './listen';

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

const minute = (m: number) => new Date(AT.getTime() + m * 60_000);
const by = (name: string) => ({ tenantId: T1, uid: uid(name), name });
const changes = (p: string, at: number, ids: string[], who: string, batch: string | null = null): AuditEntry[] => {
  const queue = [...ids];
  return buildAuditEntries(
    by(who),
    ids.map((id) => ({ type: 'price.changed' as const, field: 'price' as const, productId: productId(p), variantId: variantId(`v-${id}`), before: null, after: money(100, 'USD') })),
    { batchId: batch ? batchId(batch) : null, at: minute(at), newEntryId: () => auditEntryId(queue.shift() ?? 'x') },
  );
};
/**
 * La bitácora de t1, de la más vieja a la más nueva. `e-a` y `e-b` son una edición masiva: mismo
 * instante, y el cursor tiene que desempatarlas sin saltear ni repetir.
 */
const AUDIT: AuditEntry[] = [
  ...changes('p1', 1, ['e-a', 'e-b'], 'ana', 'b1'),
  ...buildAuditEntries(by('beto'), [{ type: 'stock.adjusted', productId: productId('p1'), variantId: variantId('v-c'), before: { kind: 'undefined' }, after: { kind: 'quantity', value: 3 } }], {
    batchId: null,
    at: minute(2),
    newEntryId: () => auditEntryId('e-c'),
  }),
  buildTeamAuditEntry(by('cli-owner'), { change: 'role.assigned', entity: { kind: 'membership', id: 'ana' }, before: { roleId: 'catalog' }, after: { roleId: 'precios' } }, { at: minute(3), id: auditEntryId('e-d') }),
  ...changes('p3', 4, ['e-e'], 'beto'),
];

const product = (id: string, name: string, minute: number, overrides: Partial<Product> = {}): Product => ({
  ...storefrontDefaults(),
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
    // La misma cuenta, colaboradora activa en t2 e invitada sin aceptar en t3 (FR-005, FR-007).
    for (const [id, name, status] of [['t2', 'Comercio Dos', 'active'], ['t3', 'Comercio Tres', 'invited']] as const) {
      await db.doc(`tenants/${id}`).set({ name, ownerUid: 'otra', currency: 'USD', createdAt: AT, createdBy: 'seed', status: 'active' });
      await new FirestoreUnitOfWork(db, tenantId(id)).run(async (tx) => {
        const invited = inviteMembership({ uid: uid(OWNER.uid), tenantId: tenantId(id), roleId: roleId('catalog'), displayName: 'Dueña', email: OWNER.email, at: AT });
        await tx.members.save(status === 'active' ? activateMembership(invited, AT) : invited);
        await tx.roles.save(createCatalogRole(tenantId(id), AT));
      });
    }
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
        product('p1', 'Camiseta', 1, { options: [color], slug: slug('camiseta-roja'), tags: ['Verano'], tagsNormalized: ['verano'] }),
        // Con peso y dimensiones: el único al que no le faltan datos de envío (FR-017).
        product('p2', 'Café con leche', 3, {
          status: 'active',
          brand: 'Nativa',
          brandNormalized: 'nativa',
          weightGrams: 500,
          dimensionsMm: { length: 100, width: 100, height: 100 },
          missingShippingData: false,
        }),
        product('p3', 'Taza', 2),
        product('p4', 'Cafetera vieja', 4, { archived: true }),
      ]) {
        await tx.products.save(p);
      }
      await tx.costs.setMany(productId('p1'), { [variantId('v-viva')]: money(1200, 'USD') });
      await tx.slugIndex.reserve(slug('camiseta-roja'), productId('p1'));
      await tx.vocabulary.save({ tags: { verano: { label: 'Verano', count: 1 } }, brands: { nativa: { label: 'Nativa', count: 1 } } });
      for (const role of presetRoles(T1, AT)) await tx.roles.save(role);
      const invite = (id: string, email: string) => createInvitation({ id: invitationId(id), tenantId: T1, email, roleId: roleId('catalog'), createdBy: uid(OWNER.uid), at: AT });
      await tx.invitations.save(invite('i-pendiente', 'pendiente@t1.test'));
      await tx.invitations.save(revokeInvitation(invite('i-revocada', 'revocada@t1.test')));
      await tx.audit.append(AUDIT);
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

    it('los comercios de la cuenta: solo membresías activas, con su nombre y si es Propietaria (T075)', async () => {
      const directory = new FirestoreTenantDirectory(webDb);
      const tenants = await first<readonly TenantAccess[]>((watcher) => directory.watchTenantsOf(uid(OWNER.uid), watcher));
      expect(tenants).toEqual([
        { tenantId: 't2', name: 'Comercio Dos', isOwner: false },
        { tenantId: 't1', name: 'Comercio Uno', isOwner: true },
      ]);
    });

    // T079: lo que el panel ofrece en cada comercio sale de la membresía y su rol, como en el servidor.
    it.each<[string, MemberAccess | null]>([
      ['t1', { isOwner: true, permissions: [] }],
      ['t2', { isOwner: false, permissions: ['catalog.read', 'catalog.write', 'variant.stock.write'] }],
      ['t3', null],
      ['t9', null],
    ])('el acceso de la cuenta en %s', async (id, expected) => {
      const directory = new FirestoreTenantDirectory(webDb);
      await expect(first<MemberAccess | null>((watcher) => directory.watchAccess(tenantId(id), uid(OWNER.uid), watcher))).resolves.toEqual(expected);
    });

    it('los costos de un producto, por variante; sin documento, ninguno (T078)', async () => {
      const costs = (id: string) => first<ReadonlyMap<VariantId, Money>>((watcher) => queries.watchCosts(T1, productId(id), watcher));
      expect([...(await costs('p1'))]).toEqual([['v-viva', money(1200, 'USD')]]);
      expect((await costs('p3')).size).toBe(0);
    });

    // T076: lo que lee la vista de equipo del Propietario.
    it('el equipo: membresías, roles e invitaciones pendientes, sin las revocadas', async () => {
      const team = new FirestoreTeamQueries(webDb);
      const members = await first<readonly Membership[]>((watcher) => team.watchMembers(T1, watcher));
      expect(members.map((m) => [m.uid, m.isOwner, m.status])).toEqual([[OWNER.uid, true, 'active']]);
      const roles = await first<readonly Role[]>((watcher) => team.watchRoles(T1, watcher));
      expect(roles.map((r) => r.id).sort()).toEqual(['catalog', 'owner']);
      const invitations = await first<readonly Invitation[]>((watcher) => team.watchInvitations(T1, watcher));
      expect(invitations.map((i) => [i.id, i.email, i.status])).toEqual([['i-pendiente', 'pendiente@t1.test', 'pending']]);
    });

    // T084 — la bitácora por páginas y con filtros (FR-034), de la más nueva a la más vieja.
    describe('bitácora', () => {
      const audit = new FirestoreAuditQueries(webDb);
      const ids = async (filter: AuditFilter) => (await audit.listEntries(T1, filter, { limit: 10 })).entries.map((e) => e.id);

      it('se recorre por cursor sin saltear ni repetir, también dentro de una edición masiva', async () => {
        const seen: string[] = [];
        let after: AuditCursor | undefined;
        for (let pages = 0; pages < 10; pages++) {
          const page = await audit.listEntries(T1, {}, { limit: 2, ...(after ? { after } : {}) });
          seen.push(...page.entries.map((e) => e.id));
          if (!page.next) break;
          after = page.next;
        }
        expect(seen).toEqual(['e-e', 'e-d', 'e-c', 'e-b', 'e-a']);
      });

      it.each<[string, AuditFilter, string[]]>([
        ['por persona', { actorUid: 'beto' }, ['e-e', 'e-c']],
        ['por producto', { productId: productId('p1') }, ['e-c', 'e-b', 'e-a']],
        ['por tipo de evento', { type: 'role.changed' }, ['e-d']],
        ['por rango de fechas', { from: minute(2), to: minute(4) }, ['e-d', 'e-c']],
        ['combinando persona y producto', { actorUid: 'beto', productId: productId('p1') }, ['e-c']],
      ])('filtra %s', async (_label, filter, expected) => {
        await expect(ids(filter)).resolves.toEqual(expected);
      });

      it('cada entrada llega con su tipo, su responsable y sus valores', async () => {
        const [entry] = (await audit.listEntries(T1, { type: 'stock.adjusted' }, { limit: 1 })).entries;
        expect(entry).toEqual(expect.objectContaining({ actorUid: 'beto', actorName: 'beto', at: minute(2), before: { kind: 'undefined' }, after: { kind: 'quantity', value: 3 } }));
      });
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

    // T037 (002) — los filtros de la ficha de tienda, cada uno con su índice (catalog-indexes.spec.ts).
    it('filtra por etiqueta, comparada sin mayúsculas ni acentos', async () => {
      await expect(names({ tag: 'VERANO', limit: 10 })).resolves.toEqual(['Camiseta']);
    });

    it('filtra por marca, también junto con el estado', async () => {
      await expect(names({ brand: 'nativa', limit: 10 })).resolves.toEqual(['Café con leche']);
      await expect(names({ status: 'active', brand: 'Nativa', limit: 10 })).resolves.toEqual(['Café con leche']);
      await expect(names({ status: 'draft', brand: 'Nativa', limit: 10 })).resolves.toEqual([]);
    });

    it('filtra los físicos a los que les faltan datos de envío (FR-017)', async () => {
      await expect(names({ missingShippingData: true, limit: 10 })).resolves.toEqual(['Taza', 'Camiseta']);
    });

    // FR-035: la búsqueda encuentra también por la URL amigable exacta, aunque el nombre no empiece así.
    it('la búsqueda encuentra un producto por su URL amigable', async () => {
      await expect(names({ search: 'camiseta-roja', limit: 10 })).resolves.toEqual(['Camiseta']);
      await expect(names({ search: 'Camiseta Roja', limit: 10 })).resolves.toEqual(['Camiseta']);
    });

    it('la reserva de una URL se lee para la vista previa; una libre, como null (FR-007)', async () => {
      await expect(queries.findSlug(T1, slug('camiseta-roja'))).resolves.toEqual({ productId: 'p1', kind: 'current' });
      await expect(queries.findSlug(T1, slug('libre'))).resolves.toBeNull();
    });

    it('el vocabulario del comercio llega para sugerir (FR-011, FR-012)', async () => {
      const vocabulary = await first((watcher) => queries.watchVocabulary(T1, watcher));
      expect(vocabulary).toEqual({ tags: { verano: { label: 'Verano', count: 1 } }, brands: { nativa: { label: 'Nativa', count: 1 } } });
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

  // Quien llega por una invitación sin cuenta la crea, con su nombre ya en el token (T080).
  it('crear una cuenta deja la sesión abierta con su nombre en el token; el mismo correo no se repite', async () => {
    const other = initializeApp({ projectId: 'demo-ecommerce', apiKey: 'demo-key' }, 'navegador-nuevo');
    const otherAuth = getAuth(other);
    connectAuthEmulator(otherAuth, `http://${emulatorHost('FIREBASE_AUTH_EMULATOR_HOST')}`, { disableWarnings: true });
    try {
      const email = `nueva-${Date.now()}@t1.test`;
      const created = await new FirebaseSession(otherAuth).signUp({ email, password: 'test-1234', displayName: 'Nueva' });
      expect(created).toEqual({ ok: true, user: expect.objectContaining({ email, displayName: 'Nueva' }) });
      const claims = (await otherAuth.currentUser?.getIdTokenResult())?.claims;
      expect(claims).toEqual(expect.objectContaining({ name: 'Nueva', email }));

      const again = await new FirebaseSession(otherAuth).signUp({ email, password: 'test-1234', displayName: 'Otra' });
      expect(again).toEqual({ ok: false, reason: 'email-in-use' });
    } finally {
      await deleteApp(other);
    }
  });

  // T098 (FR-037): sin red, lo que no está en caché no se presenta como vacío sino como error, y la
  // lectura se recupera sola cuando vuelve la red.
  it('sin red, una lectura falla como "sin conexión" en vez de llegar vacía, y se recupera con la red', async () => {
    const other = initializeApp({ projectId: 'demo-ecommerce', apiKey: 'demo-key' }, 'navegador-sin-red');
    const otherAuth = getAuth(other);
    const otherDb = getFirestore(other);
    connectAuthEmulator(otherAuth, `http://${emulatorHost('FIREBASE_AUTH_EMULATOR_HOST')}`, { disableWarnings: true });
    const [host, port] = emulatorHost('FIRESTORE_EMULATOR_HOST').split(':');
    connectFirestoreEmulator(otherDb, host ?? '127.0.0.1', Number(port));
    try {
      await new FirebaseSession(otherAuth).signIn(OWNER.email, OWNER.password);
      await disableNetwork(otherDb);
      const values: unknown[] = [];
      let failed: (error: unknown) => void = () => undefined;
      const failure = new Promise<unknown>((resolve) => (failed = resolve));
      const stop = listenToDoc(doc(otherDb, 'tenants/t1/products/p1'), { next: (value) => values.push(value), error: (error) => failed(error) }, (snapshot) => snapshot.get('name'), 300);
      await expect(failure).resolves.toBeInstanceOf(OfflineError);
      expect(values).toEqual([]);

      // La misma escucha sigue abierta: cuando vuelve la red, entrega el dato y la vista se recupera.
      await enableNetwork(otherDb);
      await expect.poll(() => values).toEqual(['Camiseta']);
      stop();
    } finally {
      await terminate(otherDb);
      await deleteApp(other);
    }
  });
});

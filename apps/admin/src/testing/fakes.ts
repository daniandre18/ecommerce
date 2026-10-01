import type {
  CatalogCommands,
  CatalogQueries,
  ImageStorage,
  TenantAccess,
  TenantDirectory,
  UploadRequest,
  UploadResult,
  ProductListQuery,
  Session,
  SessionUser,
  SignInResult,
  Unsubscribe,
  Watcher,
} from '@ecommerce/application';
import { signal, type Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  normalizeName,
  PRESET_CATALOG_PERMISSIONS,
  productId,
  tenantId,
  uid,
  type CurrencyCode,
  type MemberAccess,
  type Money,
  type PlatformOperatorId,
  type Product,
  type ProductId,
  type Tenant,
  type TenantId,
  type Uid,
  type Variant,
  type VariantId,
} from '@ecommerce/domain';
import { CURRENT_ACCESS } from '../app/tenant/current-access';

const AT = new Date('2026-09-30T12:00:00Z');

export const OWNER: SessionUser = { uid: uid('owner'), email: 'owner@t1.test', displayName: 'Dueña' };

export class FakeSession implements Session {
  user: SessionUser | null = null;
  nextSignIn: SignInResult = { ok: true, user: OWNER };
  readonly signIns: { email: string; password: string }[] = [];
  signedOut = false;

  async current(): Promise<SessionUser | null> {
    return this.user;
  }

  watch(watcher: Watcher<SessionUser | null>): Unsubscribe {
    watcher.next(this.user);
    return () => undefined;
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    this.signIns.push({ email, password });
    if (this.nextSignIn.ok) this.user = this.nextSignIn.user;
    return this.nextSignIn;
  }

  async signOut(): Promise<void> {
    this.user = null;
    this.signedOut = true;
  }
}

/** Una suscripción que la prueba controla: decide qué se emite y comprueba si se cortó. */
export class Subscription<T, P = unknown> {
  closed = false;

  constructor(
    readonly params: P,
    private readonly watcher: Watcher<T>,
  ) {}

  emit(value: T): void {
    if (!this.closed) this.watcher.next(value);
  }

  fail(error: unknown): void {
    if (!this.closed) this.watcher.error(error);
  }
}

export class FakeCatalogQueries implements CatalogQueries {
  readonly tenants: Subscription<Tenant | null, TenantId>[] = [];
  readonly productLists: Subscription<readonly Product[], { tenantId: TenantId; query: ProductListQuery }>[] = [];
  readonly products: Subscription<Product | null, { tenantId: TenantId; productId: ProductId }>[] = [];
  readonly variantLists: Subscription<readonly Variant[], { tenantId: TenantId; productId: ProductId }>[] = [];
  readonly costLists: Subscription<ReadonlyMap<VariantId, Money>, { tenantId: TenantId; productId: ProductId }>[] = [];

  watchTenant(id: TenantId, watcher: Watcher<Tenant | null>): Unsubscribe {
    return this.open(this.tenants, new Subscription(id, watcher));
  }

  watchProducts(id: TenantId, query: ProductListQuery, watcher: Watcher<readonly Product[]>): Unsubscribe {
    return this.open(this.productLists, new Subscription({ tenantId: id, query }, watcher));
  }

  watchProduct(id: TenantId, productId: ProductId, watcher: Watcher<Product | null>): Unsubscribe {
    return this.open(this.products, new Subscription({ tenantId: id, productId }, watcher));
  }

  watchVariants(id: TenantId, productId: ProductId, watcher: Watcher<readonly Variant[]>): Unsubscribe {
    return this.open(this.variantLists, new Subscription({ tenantId: id, productId }, watcher));
  }

  watchCosts(id: TenantId, productId: ProductId, watcher: Watcher<ReadonlyMap<VariantId, Money>>): Unsubscribe {
    return this.open(this.costLists, new Subscription({ tenantId: id, productId }, watcher));
  }

  /** La suscripción abierta más reciente al listado. */
  get productList(): Subscription<readonly Product[], { tenantId: TenantId; query: ProductListQuery }> {
    const open = this.productLists.filter((s) => !s.closed);
    const last = open.at(-1);
    if (!last) throw new Error('No hay ninguna suscripción abierta al listado');
    return last;
  }

  private open<S extends { closed: boolean }>(list: S[], subscription: S): Unsubscribe {
    list.push(subscription);
    return () => {
      subscription.closed = true;
    };
  }
}

type Mocked<T> = { -readonly [K in keyof T]: T[K] & ReturnType<typeof vi.fn> };

/** Cada orden es un `vi.fn`: la prueba decide qué devuelve y comprueba con qué se llamó. */
export function fakeCatalogCommands(): Mocked<CatalogCommands> {
  const pending = () => vi.fn(() => new Promise<never>(() => undefined));
  return {
    createProduct: pending(),
    updateProductDetails: pending(),
    setProductOptions: pending(),
    setProductStatus: pending(),
    setVariantSku: pending(),
    setVariantImages: pending(),
    archiveProduct: pending(),
    archiveVariant: pending(),
    setVariantPrice: pending(),
    setVariantCost: pending(),
    setVariantStock: pending(),
  } as unknown as Mocked<CatalogCommands>;
}

export const T1 = tenantId('t1');

export const tenant = (overrides: Partial<Tenant> = {}): Tenant => ({
  id: T1,
  name: 'Comercio Uno',
  ownerUid: OWNER.uid,
  currency: 'USD' as CurrencyCode,
  createdAt: AT,
  createdBy: 'seed' as PlatformOperatorId,
  status: 'active',
  ...overrides,
});

export const product = (id: string, name: string, overrides: Partial<Product> = {}): Product => ({
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
  updatedAt: AT,
  version: 1,
  ...overrides,
});

/** Storage controlado por la prueba: cada subida queda registrada y devuelve lo que se le indique. */
export class FakeImageStorage implements ImageStorage {
  readonly uploads: UploadRequest[] = [];
  nextUpload: UploadResult = { ok: true, storagePath: 'tenants/t1/products/p1/images/nueva.png' };

  async upload(request: UploadRequest): Promise<UploadResult> {
    this.uploads.push(request);
    request.onProgress?.(0.5);
    request.onProgress?.(1);
    return this.nextUpload;
  }

  async displayUrl(storagePath: string): Promise<string> {
    return `https://imagenes.test/${storagePath}`;
  }
}

/** Los comercios de la cuenta, controlados por la prueba. */
export class FakeTenantDirectory implements TenantDirectory {
  readonly subscriptions: Subscription<readonly TenantAccess[], string>[] = [];
  readonly accesses: Subscription<MemberAccess | null, { tenantId: TenantId; uid: Uid }>[] = [];

  watchTenantsOf(uid: string, watcher: Watcher<readonly TenantAccess[]>): Unsubscribe {
    const subscription = new Subscription<readonly TenantAccess[], string>(uid, watcher);
    this.subscriptions.push(subscription);
    return () => {
      subscription.closed = true;
    };
  }

  watchAccess(id: TenantId, uid: Uid, watcher: Watcher<MemberAccess | null>): Unsubscribe {
    const subscription = new Subscription<MemberAccess | null, { tenantId: TenantId; uid: Uid }>({ tenantId: id, uid }, watcher);
    this.accesses.push(subscription);
    return () => {
      subscription.closed = true;
    };
  }

  get open(): Subscription<readonly TenantAccess[], string> {
    const last = this.subscriptions.filter((s) => !s.closed).at(-1);
    if (!last) throw new Error('No hay ninguna suscripción abierta a los comercios');
    return last;
  }
}

export const access = (id: string, name: string, isOwner = false): TenantAccess => ({ tenantId: tenantId(id), name, isOwner });

export const OWNER_ACCESS: MemberAccess = { isOwner: true, permissions: [] };
/** El rol de Catálogo predefinido: sin precios y sin costo (FR-016). */
export const CATALOG_ACCESS: MemberAccess = { isOwner: false, permissions: PRESET_CATALOG_PERMISSIONS };
/** Solo lectura del catálogo: lo mínimo para entrar a verlo. */
export const READ_ONLY_ACCESS: MemberAccess = { isOwner: false, permissions: ['catalog.read'] };

/** El acceso que el marco del comercio da a sus vistas. Por omisión, el del Propietario. */
export function provideAccess(access: MemberAccess | null | undefined = OWNER_ACCESS): Provider {
  return { provide: CURRENT_ACCESS, useValue: signal(access) };
}

/** Otro acceso para una prueba puntual. Se llama antes de crear el componente. */
export function useAccess(access: MemberAccess | null | undefined): void {
  TestBed.overrideProvider(CURRENT_ACCESS, { useValue: signal(access) });
}

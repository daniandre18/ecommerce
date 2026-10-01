import type {
  CatalogCommands,
  CatalogQueries,
  ProductListQuery,
  Session,
  SessionUser,
  SignInResult,
  Unsubscribe,
  Watcher,
} from '@ecommerce/application';
import {
  normalizeName,
  productId,
  tenantId,
  uid,
  type CurrencyCode,
  type PlatformOperatorId,
  type Product,
  type Tenant,
  type TenantId,
} from '@ecommerce/domain';

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

  watchTenant(id: TenantId, watcher: Watcher<Tenant | null>): Unsubscribe {
    return this.open(this.tenants, new Subscription(id, watcher));
  }

  watchProducts(id: TenantId, query: ProductListQuery, watcher: Watcher<readonly Product[]>): Unsubscribe {
    return this.open(this.productLists, new Subscription({ tenantId: id, query }, watcher));
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

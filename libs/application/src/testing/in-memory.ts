import {
  assertCanDeleteRole,
  type AuditEntry,
  type Membership,
  type Money,
  type Product,
  type ProductId,
  type Role,
  type RoleId,
  type Tenant,
  type Uid,
  type Variant,
  type VariantId,
} from '@ecommerce/domain';
import type {
  AuditLogRepository,
  MembershipRepository,
  ProductRepository,
  RoleRepository,
  SkuIndexEntry,
  SkuIndexRepository,
  TenantRepository,
  VariantCostsRepository,
  VariantRepository,
} from '../ports/repositories';
import type { SecurityEvent, SecurityEventRecorder } from '../ports/security-events';
import type { TransactionScope, UnitOfWork } from '../ports/unit-of-work';

/**
 * Dobles en memoria de los puertos, para probar casos de uso sin emulador (principio X).
 * `run()` es transaccional de verdad: trabaja sobre una copia y solo la confirma si `work`
 * termina sin lanzar. Así las pruebas de atomicidad no dependen de Firestore.
 */
export class InMemoryStore {
  tenant: Tenant | null = null;
  members = new Map<Uid, Membership>();
  roles = new Map<RoleId, Role>();
  audit: AuditEntry[] = [];
  costs = new Map<ProductId, Record<VariantId, Money>>();
  products = new Map<ProductId, Product>();
  variants = new Map<string, Variant>();
  skuIndex = new Map<string, SkuIndexEntry>();

  clone(): InMemoryStore {
    const copy = new InMemoryStore();
    copy.tenant = this.tenant;
    copy.members = new Map(this.members);
    copy.roles = new Map(this.roles);
    copy.audit = [...this.audit];
    copy.costs = new Map([...this.costs].map(([id, costs]) => [id, { ...costs }]));
    copy.products = new Map(this.products);
    copy.variants = new Map(this.variants);
    copy.skuIndex = new Map(this.skuIndex);
    return copy;
  }

  /** Atajo para sembrar en las pruebas. */
  putVariant(variant: Variant): void {
    this.variants.set(variantKey(variant.productId, variant.id), variant);
  }

  variantsOf(productId: ProductId): Variant[] {
    return [...this.variants.values()].filter((variant) => variant.productId === productId);
  }
}

const variantKey = (productId: ProductId, variantId: VariantId) => `${productId}/${variantId}`;

/** Igual que `create` en Firestore: falla si el documento existe. */
export class DocumentAlreadyExistsError extends Error {
  override readonly name = 'DocumentAlreadyExistsError';
}

function scopeOver(s: InMemoryStore): TransactionScope {
  const tenant: TenantRepository = { get: async () => s.tenant };

  const audit: AuditLogRepository = {
    append: async (entries) => {
      for (const entry of entries) {
        if (s.audit.some((existing) => existing.id === entry.id)) throw new DocumentAlreadyExistsError(entry.id);
        s.audit.push(entry);
      }
    },
  };

  const members: MembershipRepository = {
    findByUid: async (id) => s.members.get(id) ?? null,
    save: async (membership) => {
      s.members.set(membership.uid, membership);
    },
  };

  const roles: RoleRepository = {
    findById: async (id) => s.roles.get(id) ?? null,
    list: async () => [...s.roles.values()],
    save: async (role) => {
      s.roles.set(role.id, role);
    },
    delete: async (id) => {
      const role = s.roles.get(id);
      if (!role) return;
      assertCanDeleteRole(role);
      s.roles.delete(id);
    },
  };

  const products: ProductRepository = {
    findById: async (id) => s.products.get(id) ?? null,
    save: async (product) => {
      s.products.set(product.id, product);
    },
    updateVariantSummary: async (id, summary) => {
      const product = s.products.get(id);
      if (product) s.products.set(id, { ...product, ...summary });
    },
  };

  const variants: VariantRepository = {
    findByProduct: async (productId) => s.variantsOf(productId),
    save: async (variant) => s.putVariant(variant),
    delete: async (productId, variantId) => {
      s.variants.delete(variantKey(productId, variantId));
    },
  };

  const costs: VariantCostsRepository = {
    findByProduct: async (productId) => s.costs.get(productId) ?? {},
    setMany: async (productId, values) => {
      s.costs.set(productId, { ...s.costs.get(productId), ...values });
    },
  };

  const skuIndex: SkuIndexRepository = {
    find: async (normalized) => s.skuIndex.get(normalized) ?? null,
    reserve: async (entry) => {
      if (s.skuIndex.has(entry.sku.normalized)) throw new DocumentAlreadyExistsError(entry.sku.normalized);
      s.skuIndex.set(entry.sku.normalized, { ...entry, archived: false });
    },
    release: async (normalized) => {
      s.skuIndex.delete(normalized);
    },
    markArchived: async (normalized) => {
      const entry = s.skuIndex.get(normalized);
      if (entry) s.skuIndex.set(normalized, { ...entry, archived: true });
    },
  };

  return { tenant, audit, members, roles, products, variants, costs, skuIndex };
}

export class InMemoryUnitOfWork implements UnitOfWork {
  constructor(public store: InMemoryStore = new InMemoryStore()) {}

  async run<T>(work: (tx: TransactionScope) => Promise<T>): Promise<T> {
    const draft = this.store.clone();
    const result = await work(scopeOver(draft));
    this.store = draft; // solo se confirma si `work` no lanzó
    return result;
  }
}

/** Registra los eventos en memoria. Vive fuera de la unidad de trabajo, como el de verdad. */
export class InMemorySecurityEventRecorder implements SecurityEventRecorder {
  readonly events: SecurityEvent[] = [];

  async record(event: SecurityEvent): Promise<void> {
    this.events.push(event);
  }
}

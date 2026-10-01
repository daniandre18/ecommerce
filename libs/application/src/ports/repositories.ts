import type {
  AuditEntry,
  Invitation,
  InvitationId,
  Membership,
  Money,
  Product,
  ProductId,
  Role,
  RoleId,
  Sku,
  Tenant,
  Uid,
  Variant,
  VariantId,
  VariantSummary,
} from '@ecommerce/domain';

/**
 * Solo anexado. No existe `update` ni `delete`: la inmutabilidad de la bitácora (FR-032) no es una
 * regla que alguien recuerda respetar, es que el método no existe. Las reglas de Firestore son la
 * segunda barrera para quien intente evitar esta capa.
 */
export interface AuditLogRepository {
  append(entries: readonly AuditEntry[]): Promise<void>;
}

export interface MembershipRepository {
  /** Dentro del comercio del contexto. */
  findByUid(uid: Uid): Promise<Membership | null>;
  /** Dentro del comercio del contexto; el correo, normalizado. Para no invitar a quien ya es miembro. */
  findByEmail(email: string): Promise<Membership | null>;
  save(membership: Membership): Promise<void>;
}

export interface InvitationRepository {
  findById(id: InvitationId): Promise<Invitation | null>;
  /** La pendiente para ese correo, si hay: invitar de nuevo la reenvía en vez de duplicarla. */
  findPendingByEmail(email: string): Promise<Invitation | null>;
  save(invitation: Invitation): Promise<void>;
}

export interface RoleRepository {
  findById(id: RoleId): Promise<Role | null>;
  list(): Promise<readonly Role[]>;
  save(role: Role): Promise<void>;
  /**
   * Lanza `RoleNotDeletableError` si el rol tiene miembros (FR-013) o es del sistema (FR-016).
   * La regla es la de `canDeleteRole` del dominio; el repositorio la aplica para que ningún caso de
   * uso pueda saltearla. Borrar un rol inexistente no hace nada.
   */
  delete(id: RoleId): Promise<void>;
}

/** El costo vive en otro documento, con su propia regla (FR-015). */
export interface VariantCostsRepository {
  findByProduct(productId: ProductId): Promise<Readonly<Record<VariantId, Money>>>;
  setMany(productId: ProductId, costs: Readonly<Record<VariantId, Money>>): Promise<void>;
}

/** El comercio de la unidad de trabajo. */
export interface TenantRepository {
  get(): Promise<Tenant | null>;
  /** Solo lo cambia el traspaso de propiedad (FR-011). */
  save(tenant: Tenant): Promise<void>;
}

/**
 * Los repositorios no comparan versiones: Firestore exige que dentro de una transacción todas las
 * lecturas vayan antes que las escrituras, así que `save` no puede leer. El caso de uso compara la
 * versión al cargar, en la misma transacción, y Firestore la reintenta si el documento cambió.
 */
export interface ProductRepository {
  findById(id: ProductId): Promise<Product | null>;
  /** Escribe el producto completo, con la versión que ya trae incrementada. */
  save(product: Product): Promise<void>;
  /**
   * Solo los campos de caché derivados de las variantes, SIN tocar la versión: son consecuencia de
   * editar variantes, no una edición del producto, y no deben provocar un conflicto a quien esté
   * editando su nombre o su descripción.
   */
  updateVariantSummary(id: ProductId, summary: VariantSummary): Promise<void>;
}

export interface VariantRepository {
  /** Todas las del producto, incluidas las archivadas. */
  findByProduct(productId: ProductId): Promise<Variant[]>;
  save(variant: Variant): Promise<void>;
  /** Solo para variantes sin datos: no tienen SKU que reservar ni bitácora que las nombre. */
  delete(productId: ProductId, variantId: VariantId): Promise<void>;
}

export interface SkuIndexEntry {
  readonly sku: Sku;
  readonly variantId: VariantId;
  readonly productId: ProductId;
  readonly archived: boolean;
}

/** Unicidad del SKU dentro del comercio (FR-021). El id de cada entrada es el SKU normalizado. */
export interface SkuIndexRepository {
  find(normalized: string): Promise<SkuIndexEntry | null>;
  /** Crea la reserva. Si el SKU ya existe, falla al confirmar: la colisión es atómica. */
  reserve(entry: { sku: Sku; variantId: VariantId; productId: ProductId }): Promise<void>;
  /** Libera el código anterior de una variante viva que cambió de SKU. */
  release(normalized: string): Promise<void>;
  /** El SKU de una variante archivada queda reservado para siempre (FR-023). */
  markArchived(normalized: string): Promise<void>;
}

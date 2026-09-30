import type {
  AuditEntry,
  AuditEventType,
  Membership,
  Money,
  ProductId,
  Role,
  RoleId,
  Uid,
  VariantId,
} from '@ecommerce/domain';

/**
 * Solo anexado. No existe `update` ni `delete`: la inmutabilidad de la bitácora (FR-032) no es una
 * regla que alguien recuerda respetar, es que el método no existe. Las reglas de Firestore son la
 * segunda barrera para quien intente evitar esta capa.
 */
export interface AuditLogRepository {
  append(entries: readonly AuditEntry[]): Promise<void>;
}

export interface AuditFilter {
  readonly actorUid?: Uid;
  readonly entityId?: string;
  readonly type?: AuditEventType;
  readonly from?: Date;
  readonly to?: Date;
}

export interface Page<T> {
  readonly items: readonly T[];
  /** Cursor opaco. Nunca `offset`: Firestore cobra los documentos saltados. */
  readonly nextCursor: string | null;
}

/** Lectura de la bitácora. Separada de la escritura porque se usa fuera de las transacciones. */
export interface AuditLogQuery {
  query(filter: AuditFilter, cursor?: string, pageSize?: number): Promise<Page<AuditEntry>>;
}

export interface MembershipRepository {
  /** Dentro del comercio del contexto. */
  findByUid(uid: Uid): Promise<Membership | null>;
  save(membership: Membership): Promise<void>;
}

export interface RoleRepository {
  findById(id: RoleId): Promise<Role | null>;
  list(): Promise<readonly Role[]>;
  save(role: Role): Promise<void>;
  /** Lanza si el rol tiene miembros asignados (FR-013). */
  delete(id: RoleId): Promise<void>;
}

/** El costo vive en otro documento, con su propia regla (FR-015). */
export interface VariantCostsRepository {
  findByProduct(productId: ProductId): Promise<Readonly<Record<VariantId, Money>>>;
  setMany(productId: ProductId, costs: Readonly<Record<VariantId, Money>>): Promise<void>;
}

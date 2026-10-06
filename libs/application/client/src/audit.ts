import type { AuditEntry, AuditEntryId, AuditEventType, ProductId, TenantId } from '@ecommerce/domain';

/** Los filtros de FR-034. Se combinan entre sí; los que faltan no filtran. */
export interface AuditFilter {
  /** La persona responsable. */
  readonly actorUid?: string;
  /** El producto afectado: sus variantes, sus importes y sus existencias. */
  readonly productId?: ProductId;
  readonly type?: AuditEventType;
  /** Desde este instante, inclusive. */
  readonly from?: Date;
  /** Hasta este instante, sin incluirlo. */
  readonly to?: Date;
}

/** Dónde sigue la página siguiente: la última entrada entregada. Opaco para quien lo usa. */
export interface AuditCursor {
  readonly at: Date;
  readonly id: AuditEntryId;
}

export interface AuditPage {
  readonly entries: readonly AuditEntry[];
  /** `null` si no hay más. */
  readonly next: AuditCursor | null;
}

/**
 * La consulta de la bitácora (T084, FR-034). Las reglas la reservan al Propietario: incluye cambios
 * de costo y Firestore no oculta campos sueltos (FR-015). No es en tiempo real: es una
 * investigación, y una página que se mueve sola mientras se lee confundiría más de lo que ayuda.
 */
export interface AuditQueries {
  /**
   * Una página, de la entrada más nueva a la más vieja. Se pagina por cursor y nunca por
   * desplazamiento: Firestore cobra cada documento salteado.
   */
  listEntries(tenantId: TenantId, filter: AuditFilter, page: { readonly limit: number; readonly after?: AuditCursor }): Promise<AuditPage>;
}

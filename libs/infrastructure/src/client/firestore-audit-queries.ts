import type { AuditCursor, AuditFilter, AuditPage, AuditQueries } from '@ecommerce/application/client';
import type { TenantId } from '@ecommerce/domain';
import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
  type Firestore,
  type QueryConstraint,
} from 'firebase/firestore';
import { auditEntryFromDoc } from '../mapping/audit-mappers';

/**
 * El campo de cada filtro de igualdad. Exportado para que una prueba compruebe que cada combinación
 * tiene su índice: el emulador no los exige, y uno que falte solo fallaría en producción.
 */
export const AUDIT_FILTER_FIELDS = { actorUid: 'actorUid', productId: 'entity.productId', type: 'type' } as const;

/**
 * La bitácora del comercio, por páginas. Cada combinación de filtros de igualdad tiene su índice
 * compuesto con `at` en `firestore.indexes.json`; el rango de fechas usa el mismo campo del orden.
 */
export class FirestoreAuditQueries implements AuditQueries {
  constructor(private readonly db: Firestore) {}

  async listEntries(tenantId: TenantId, filter: AuditFilter, page: { readonly limit: number; readonly after?: AuditCursor }): Promise<AuditPage> {
    const constraints: QueryConstraint[] = [];
    if (filter.actorUid) constraints.push(where(AUDIT_FILTER_FIELDS.actorUid, '==', filter.actorUid));
    if (filter.productId) constraints.push(where(AUDIT_FILTER_FIELDS.productId, '==', filter.productId));
    if (filter.type) constraints.push(where(AUDIT_FILTER_FIELDS.type, '==', filter.type));
    if (filter.from) constraints.push(where('at', '>=', Timestamp.fromDate(filter.from)));
    if (filter.to) constraints.push(where('at', '<', Timestamp.fromDate(filter.to)));
    // El id desempata entradas del mismo instante —una edición masiva las escribe juntas—: así el
    // cursor no saltea ni repite ninguna.
    constraints.push(orderBy('at', 'desc'), orderBy(documentId(), 'desc'));
    if (page.after) constraints.push(startAfter(Timestamp.fromDate(page.after.at), page.after.id));
    // Una de más para saber si hay página siguiente sin pedirla.
    constraints.push(limit(page.limit + 1));

    const snapshot = await getDocs(query(collection(this.db, 'tenants', tenantId, 'auditLog'), ...constraints));
    const entries = snapshot.docs.slice(0, page.limit).map((d) => auditEntryFromDoc(d.id, tenantId, d.data()));
    const last = entries.at(-1);
    return { entries, next: snapshot.docs.length > page.limit && last ? { at: last.at, id: last.id } : null };
  }
}

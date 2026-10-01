import type { CatalogQueries, ProductListQuery, Unsubscribe, Watcher } from '@ecommerce/application';
import { normalizeName, type Product, type Tenant, type TenantId } from '@ecommerce/domain';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Firestore,
  type Query,
  type QueryConstraint,
} from 'firebase/firestore';
import { productFromDoc, tenantFromDoc } from '../mapping/catalog-mappers';

/** Cierre de la búsqueda por prefijo: cualquier texto que empiece por el prefijo queda antes. */
const PREFIX_END = '';

/** Lecturas directas del panel. Las reglas de Firestore deciden qué puede ver cada membresía. */
export class FirestoreCatalogQueries implements CatalogQueries {
  constructor(private readonly db: Firestore) {}

  watchTenant(tenantId: TenantId, watcher: Watcher<Tenant | null>): Unsubscribe {
    return onSnapshot(
      doc(this.db, 'tenants', tenantId),
      (snapshot) => deliver(watcher, () => (snapshot.exists() ? tenantFromDoc(snapshot.id, snapshot.data()) : null)),
      (error) => watcher.error(error),
    );
  }

  watchProducts(tenantId: TenantId, request: ProductListQuery, watcher: Watcher<readonly Product[]>): Unsubscribe {
    return onSnapshot(
      productList(this.db, tenantId, request),
      (snapshot) => deliver(watcher, () => snapshot.docs.map((d) => productFromDoc(d.id, tenantId, d.data()))),
      (error) => watcher.error(error),
    );
  }
}

/**
 * Cada combinación tiene su índice compuesto en `firestore.indexes.json`, todos encabezados por
 * `archived`: el listado nunca muestra archivados.
 */
export function productList(db: Firestore, tenantId: TenantId, { status, search, limit: max }: ProductListQuery): Query {
  const constraints: QueryConstraint[] = [where('archived', '==', false)];
  if (status) constraints.push(where('status', '==', status));
  const prefix = normalizeName(search ?? '');
  if (prefix) {
    constraints.push(where('nameNormalized', '>=', prefix), where('nameNormalized', '<', prefix + PREFIX_END), orderBy('nameNormalized'));
  } else {
    constraints.push(orderBy('updatedAt', 'desc'));
  }
  return query(collection(db, 'tenants', tenantId, 'products'), ...constraints, limit(max));
}

/** Un documento corrupto que no pasa las factorías del dominio llega como error, no como excepción suelta. */
function deliver<T>(watcher: Watcher<T>, read: () => T): void {
  let value: T;
  try {
    value = read();
  } catch (error) {
    watcher.error(error);
    return;
  }
  watcher.next(value);
}

import type { CatalogQueries, ProductListQuery, Unsubscribe, Watcher } from '@ecommerce/application';
import { normalizeName, type Money, type Product, type ProductId, type Tenant, type TenantId, type Variant, type VariantId } from '@ecommerce/domain';
import {
  collection,
  doc,
  limit,
  orderBy,
  query,
  where,
  type Firestore,
  type Query,
  type QueryConstraint,
} from 'firebase/firestore';
import { productFromDoc, tenantFromDoc, variantCostsFromDoc, variantFromDoc } from '../mapping/catalog-mappers';
import { listenToDoc, listenToQuery } from './listen';

/** Cierre de la búsqueda por prefijo: cualquier texto que empiece por el prefijo queda antes. */
const PREFIX_END = '';

/** Lecturas directas del panel. Las reglas de Firestore deciden qué puede ver cada membresía. */
export class FirestoreCatalogQueries implements CatalogQueries {
  constructor(private readonly db: Firestore) {}

  watchTenant(tenantId: TenantId, watcher: Watcher<Tenant | null>): Unsubscribe {
    return listenToDoc(doc(this.db, 'tenants', tenantId), watcher, (snapshot) => (snapshot.exists() ? tenantFromDoc(snapshot.id, snapshot.data()) : null));
  }

  watchProducts(tenantId: TenantId, request: ProductListQuery, watcher: Watcher<readonly Product[]>): Unsubscribe {
    return listenToQuery(productList(this.db, tenantId, request), watcher, (snapshot) => snapshot.docs.map((d) => productFromDoc(d.id, tenantId, d.data())));
  }

  watchProduct(tenantId: TenantId, productId: ProductId, watcher: Watcher<Product | null>): Unsubscribe {
    return listenToDoc(doc(this.db, 'tenants', tenantId, 'products', productId), watcher, (snapshot) => (snapshot.exists() ? productFromDoc(snapshot.id, tenantId, snapshot.data()) : null));
  }

  watchVariants(tenantId: TenantId, productId: ProductId, watcher: Watcher<readonly Variant[]>): Unsubscribe {
    const live = query(collection(this.db, 'tenants', tenantId, 'products', productId, 'variants'), where('archived', '==', false));
    return listenToQuery(live, watcher, (snapshot) => snapshot.docs.map((d) => variantFromDoc(d.id, tenantId, productId, d.data())));
  }

  watchCosts(tenantId: TenantId, productId: ProductId, watcher: Watcher<ReadonlyMap<VariantId, Money>>): Unsubscribe {
    return listenToDoc(doc(this.db, 'tenants', tenantId, 'products', productId, 'private', 'costs'), watcher, (snapshot) => variantCostsFromDoc(snapshot.data()));
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

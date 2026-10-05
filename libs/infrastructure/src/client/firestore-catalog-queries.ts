import { mergePages, type CatalogQueries, type ProductListQuery, type SlugIndexEntry, type Unsubscribe, type Watcher } from '@ecommerce/application';
import {
  normalizeName,
  productId as toProductId,
  slugify,
  type Money,
  type Product,
  type ProductId,
  type Slug,
  type Tenant,
  type TenantId,
  type Variant,
  type VariantId,
  type Vocabulary,
} from '@ecommerce/domain';
import {
  collection,
  doc,
  getDoc,
  limit,
  orderBy,
  query,
  where,
  type Firestore,
  type Query,
  type QueryConstraint,
} from 'firebase/firestore';
import { productFromDoc, tenantFromDoc, variantCostsFromDoc, variantFromDoc } from '../mapping/catalog-mappers';
import { vocabularyFromDoc } from '../firestore/repositories/vocabulary.repository';
import { listenToDoc, listenToQuery } from './listen';

/** Cierre de la búsqueda por prefijo: cualquier texto que empiece por el prefijo queda antes. */
const PREFIX_END = '';

/** Lecturas directas del panel. Las reglas de Firestore deciden qué puede ver cada membresía. */
export class FirestoreCatalogQueries implements CatalogQueries {
  constructor(private readonly db: Firestore) {}

  watchTenant(tenantId: TenantId, watcher: Watcher<Tenant | null>): Unsubscribe {
    return listenToDoc(doc(this.db, 'tenants', tenantId), watcher, (snapshot) => (snapshot.exists() ? tenantFromDoc(snapshot.id, snapshot.data()) : null));
  }

  /**
   * Con búsqueda, además de los nombres que empiezan con lo escrito, el producto cuya URL amigable
   * es exactamente eso (FR-035 de la 002): dos consultas en tiempo real, combinadas sin repetidos.
   */
  watchProducts(tenantId: TenantId, request: ProductListQuery, watcher: Watcher<readonly Product[]>): Unsubscribe {
    const queries = [productList(this.db, tenantId, request), ...slugMatch(this.db, tenantId, request)];
    const pages: (Product[] | undefined)[] = queries.map(() => undefined);
    const byName = (a: Product, b: Product) => a.nameNormalized.localeCompare(b.nameNormalized);
    // Cada consulta espera al servidor antes de su primera página (`listenToQuery`), como las demás.
    const stops = queries.map((q, i) =>
      listenToQuery(
        q,
        {
          next: (page) => {
            pages[i] = page;
            // Hasta que llegue la primera página de cada consulta, no hay nada completo que mostrar.
            if (pages.some((p) => p === undefined)) return;
            const ready = pages as Product[][];
            watcher.next(ready.length === 1 ? (ready[0] ?? []) : mergePages(ready, { key: (p) => p.id, compare: byName, limit: request.limit }));
          },
          error: (error) => watcher.error(error),
        },
        (snapshot) => snapshot.docs.map((d) => productFromDoc(d.id, tenantId, d.data())),
      ),
    );
    return () => stops.forEach((stop) => stop());
  }

  watchProduct(tenantId: TenantId, productId: ProductId, watcher: Watcher<Product | null>): Unsubscribe {
    return listenToDoc(doc(this.db, 'tenants', tenantId, 'products', productId), watcher, (snapshot) => (snapshot.exists() ? productFromDoc(snapshot.id, tenantId, snapshot.data()) : null));
  }

  watchVariants(tenantId: TenantId, productId: ProductId, watcher: Watcher<readonly Variant[]>): Unsubscribe {
    const live = query(collection(this.db, 'tenants', tenantId, 'products', productId, 'variants'), where('archived', '==', false));
    return listenToQuery(live, watcher, (snapshot) => snapshot.docs.map((d) => variantFromDoc(d.id, tenantId, productId, d.data())));
  }

  watchVocabulary(tenantId: TenantId, watcher: Watcher<Vocabulary>): Unsubscribe {
    return listenToDoc(doc(this.db, 'tenants', tenantId, 'storefront', 'vocabulary'), watcher, (snapshot) => vocabularyFromDoc(snapshot.data() ?? {}));
  }

  async findSlug(tenantId: TenantId, slug: Slug): Promise<SlugIndexEntry | null> {
    const data = (await getDoc(doc(this.db, 'tenants', tenantId, 'slugIndex', slug))).data();
    if (!data) return null;
    return { productId: toProductId(String(data['productId'])), kind: data['kind'] === 'previous' ? 'previous' : 'current' };
  }

  watchCosts(tenantId: TenantId, productId: ProductId, watcher: Watcher<ReadonlyMap<VariantId, Money>>): Unsubscribe {
    return listenToDoc(doc(this.db, 'tenants', tenantId, 'products', productId, 'private', 'costs'), watcher, (snapshot) => variantCostsFromDoc(snapshot.data()));
  }
}

/**
 * Los filtros de la ficha de tienda, con el campo y el tipo de condición que usa cada uno. El índice
 * de cada combinación con y sin estado lo verifica `catalog-indexes.spec.ts`.
 */
export const PRODUCT_ATTRIBUTE_FILTERS = {
  tag: { fieldPath: 'tagsNormalized', arrayConfig: 'CONTAINS' },
  brand: { fieldPath: 'brandNormalized', order: 'ASCENDING' },
  missingShippingData: { fieldPath: 'missingShippingData', order: 'ASCENDING' },
} as const;

/**
 * Cada combinación tiene su índice compuesto en `firestore.indexes.json`, todos encabezados por
 * `archived`: el listado nunca muestra archivados.
 */
export function productList(db: Firestore, tenantId: TenantId, request: ProductListQuery): Query {
  const { status, search, limit: max } = request;
  const constraints: QueryConstraint[] = [where('archived', '==', false)];
  if (status) constraints.push(where('status', '==', status));
  constraints.push(...attributeFilter(request));
  const prefix = normalizeName(search ?? '');
  if (prefix) {
    constraints.push(where('nameNormalized', '>=', prefix), where('nameNormalized', '<', prefix + PREFIX_END), orderBy('nameNormalized'));
  } else {
    constraints.push(orderBy('updatedAt', 'desc'));
  }
  return query(collection(db, 'tenants', tenantId, 'products'), ...constraints, limit(max));
}

/** A lo sumo uno de los filtros de la ficha: el primero que venga, en este orden. */
function attributeFilter({ tag, brand, missingShippingData }: ProductListQuery): QueryConstraint[] {
  if (tag) return [where(PRODUCT_ATTRIBUTE_FILTERS.tag.fieldPath, 'array-contains', normalizeName(tag))];
  if (brand) return [where(PRODUCT_ATTRIBUTE_FILTERS.brand.fieldPath, '==', normalizeName(brand))];
  if (missingShippingData) return [where(PRODUCT_ATTRIBUTE_FILTERS.missingShippingData.fieldPath, '==', true)];
  return [];
}

/** La búsqueda por URL amigable: igualdad sobre `slug`, si lo escrito produce una. */
function slugMatch(db: Firestore, tenantId: TenantId, { search }: ProductListQuery): Query[] {
  const slug = search ? slugify(search) : null;
  if (!slug) return [];
  return [query(collection(db, 'tenants', tenantId, 'products'), where('archived', '==', false), where('slug', '==', slug), limit(1))];
}


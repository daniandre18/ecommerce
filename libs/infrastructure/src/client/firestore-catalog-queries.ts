import { chunkIds, mergePages, type CatalogQueries, type ProductListQuery, type SlugIndexEntry, type Unsubscribe, type Watcher } from '@ecommerce/application/client';
import {
  normalizeName,
  categoryId as toCategoryId,
  productId as toProductId,
  slugify,
  type CategoryId,
  type CategoryTree,
  type FeaturedSections,
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
  documentId,
  getCountFromServer,
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
import { categoryTreeFromDoc } from '../mapping/category-mappers';
import { sectionsFromDoc } from '../mapping/sections-mappers';
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
   * es exactamente eso (FR-035 de la 002). Filtrado por una rama de categorías de más de 30 ids, una
   * consulta por cada grupo de hasta 30 (research §2). Todas en tiempo real, combinadas sin
   * repetidos, en el orden del listado y cortadas al tamaño de página.
   */
  watchProducts(tenantId: TenantId, request: ProductListQuery, watcher: Watcher<readonly Product[]>): Unsubscribe {
    if (request.categoryIds?.length === 0 || request.productIds?.length === 0) {
      watcher.next([]);
      return () => undefined;
    }
    const lists = request.productIds
      ? chunkIds(request.productIds).map((chunk) => byIds(this.db, tenantId, chunk))
      : request.categoryIds
        ? chunkIds(request.categoryIds).map((chunk) => productList(this.db, tenantId, { ...request, categoryIds: chunk }))
        : [productList(this.db, tenantId, request)];
    // Por id no se puede filtrar ni ordenar en la consulta sin un índice por combinación: con a lo
    // sumo 40 productos, el estado se aplica sobre lo que llega, y el corte después. Un archivado no
    // está en ninguna sección: archivar lo saca en la misma transacción (FR-028).
    const select = (p: Product) => !request.status || p.status === request.status;
    const queries = [...lists, ...slugMatch(this.db, tenantId, request)];
    const pages: (Product[] | undefined)[] = queries.map(() => undefined);
    const byName = (a: Product, b: Product) => a.nameNormalized.localeCompare(b.nameNormalized);
    const byEdition = (a: Product, b: Product) => b.updatedAt.getTime() - a.updatedAt.getTime();
    const compare = normalizeName(request.search ?? '') ? byName : byEdition;
    // Cada consulta espera al servidor antes de su primera página (`listenToQuery`). Así no se combina
    // lo que una consulta nueva encuentra en la caché local, que es solo lo que trajo otra (hallado por
    // T049), con una página del servidor: esa vista parcial dejaría afuera productos que sí están.
    const stops = queries.map((q, i) =>
      listenToQuery<Product[]>(
        q,
        {
          next: (page) => {
            pages[i] = page;
            // Hasta que llegue la primera página de cada consulta, no hay nada completo que mostrar.
            if (pages.some((p) => p === undefined)) return;
            const ready = pages as Product[][];
            if (request.productIds) {
              const all = mergePages(ready, { key: (p) => p.id, compare, limit: Number.MAX_SAFE_INTEGER });
              watcher.next(all.filter(select).slice(0, request.limit));
              return;
            }
            watcher.next(ready.length === 1 ? (ready[0] ?? []) : mergePages(ready, { key: (p) => p.id, compare, limit: request.limit }));
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

  /** De a una, como `findSlug`: las reglas no dejan listar `categorySlugs` (caso 49). */
  async findCategorySlug(tenantId: TenantId, slug: Slug): Promise<CategoryId | null> {
    const data = (await getDoc(doc(this.db, 'tenants', tenantId, 'categorySlugs', slug))).data();
    return data ? toCategoryId(String(data['categoryId'])) : null;
  }

  watchCategoryTree(tenantId: TenantId, watcher: Watcher<CategoryTree>): Unsubscribe {
    return listenToDoc(doc(this.db, 'tenants', tenantId, 'storefront', 'categoryTree'), watcher, (snapshot) => categoryTreeFromDoc(snapshot.data()));
  }

  watchSections(tenantId: TenantId, watcher: Watcher<FeaturedSections>): Unsubscribe {
    return listenToDoc(doc(this.db, 'tenants', tenantId, 'storefront', 'sections'), watcher, (snapshot) => sectionsFromDoc(snapshot.data()));
  }

  /** Una agregación: no lee los productos, los cuenta (research §2). */
  async countInCategory(tenantId: TenantId, categoryId: CategoryId): Promise<number> {
    const counted = await getCountFromServer(query(collection(this.db, 'tenants', tenantId, 'products'), where('categoryIds', 'array-contains', categoryId)));
    return counted.data().count;
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
  categoryIds: { fieldPath: 'categoryIds', arrayConfig: 'CONTAINS' },
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

/**
 * A lo sumo uno de los filtros de la ficha o la categoría: el primero que venga, en este orden.
 * `categoryIds` llega ya partido en grupos de hasta 30.
 */
function attributeFilter({ categoryIds, tag, brand, missingShippingData }: ProductListQuery): QueryConstraint[] {
  if (categoryIds) return [where(PRODUCT_ATTRIBUTE_FILTERS.categoryIds.fieldPath, 'array-contains-any', [...categoryIds])];
  if (tag) return [where(PRODUCT_ATTRIBUTE_FILTERS.tag.fieldPath, 'array-contains', normalizeName(tag))];
  if (brand) return [where(PRODUCT_ATTRIBUTE_FILTERS.brand.fieldPath, '==', normalizeName(brand))];
  if (missingShippingData) return [where(PRODUCT_ATTRIBUTE_FILTERS.missingShippingData.fieldPath, '==', true)];
  return [];
}

/** Hasta 30 productos por id: los de una sección destacada (FR-027c). */
function byIds(db: Firestore, tenantId: TenantId, ids: readonly ProductId[]): Query {
  return query(collection(db, 'tenants', tenantId, 'products'), where(documentId(), 'in', [...ids]));
}

/** La búsqueda por URL amigable: igualdad sobre `slug`, si lo escrito produce una. */
function slugMatch(db: Firestore, tenantId: TenantId, { search }: ProductListQuery): Query[] {
  const slug = search ? slugify(search) : null;
  if (!slug) return [];
  return [query(collection(db, 'tenants', tenantId, 'products'), where('archived', '==', false), where('slug', '==', slug), limit(1))];
}


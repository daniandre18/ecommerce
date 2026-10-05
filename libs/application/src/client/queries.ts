import type { Money, Product, ProductId, ProductStatus, Slug, Tenant, TenantId, Variant, VariantId, Vocabulary } from '@ecommerce/domain';
import type { SlugIndexEntry } from '../ports/repositories';

/** Corta la suscripción. Llamarla dos veces no hace nada. */
export type Unsubscribe = () => void;

/** Recibe el valor inicial y cada cambio posterior, o el error que cortó la suscripción. */
export interface Watcher<T> {
  next(value: T): void;
  error(error: unknown): void;
}

export interface ProductListQuery {
  /** Sin estado, todos los que están en circulación. */
  readonly status?: ProductStatus;
  /**
   * Prefijo del nombre, comparado normalizado como `nameNormalized`. Encuentra además el producto
   * cuya URL amigable es exactamente lo escrito, normalizado (FR-035 de la 002).
   */
  readonly search?: string;
  // Filtros de la ficha de tienda (002). Se combinan con el estado, pero entre sí de a uno: Firestore
  // admite una sola condición de arreglo por consulta, y cada combinación necesita su índice.
  /** Una etiqueta; se compara normalizada. */
  readonly tag?: string;
  /** Una marca; se compara normalizada. */
  readonly brand?: string;
  /** Solo los físicos a los que les falta peso o dimensiones (FR-017). */
  readonly missingShippingData?: true;
  readonly limit: number;
}

/**
 * Lecturas del catálogo, directas a Firestore y acotadas por sus reglas (no hay callable de
 * lectura). En tiempo real: lo que cambia una orden llega solo, sin volver a pedirlo.
 */
export interface CatalogQueries {
  /** El comercio, por su nombre y su moneda. `null` si no existe o no hay acceso. */
  watchTenant(tenantId: TenantId, watcher: Watcher<Tenant | null>): Unsubscribe;
  /**
   * Productos no archivados. Sin búsqueda, los editados más recientemente primero; con búsqueda,
   * por nombre. No lee variantes: se leen al abrir el producto.
   */
  watchProducts(tenantId: TenantId, query: ProductListQuery, watcher: Watcher<readonly Product[]>): Unsubscribe;
  /** Un producto. `null` si no existe. */
  watchProduct(tenantId: TenantId, productId: ProductId, watcher: Watcher<Product | null>): Unsubscribe;
  /** Las variantes en circulación de un producto, sin orden: el orden lo dan sus opciones. */
  watchVariants(tenantId: TenantId, productId: ProductId, watcher: Watcher<readonly Variant[]>): Unsubscribe;
  /**
   * El costo de adquisición de cada variante que lo tiene cargado. Vive en un documento aparte que
   * solo leen el Propietario y quien tenga `variant.cost.read` (FR-015): el panel no lo pide sin
   * ese permiso, y si lo pidiera, la lectura llegaría como error.
   */
  watchCosts(tenantId: TenantId, productId: ProductId, watcher: Watcher<ReadonlyMap<VariantId, Money>>): Unsubscribe;
  /** Etiquetas y marcas del comercio, para sugerir mientras se escribe (FR-011, FR-012). */
  watchVocabulary(tenantId: TenantId, watcher: Watcher<Vocabulary>): Unsubscribe;
  /**
   * La reserva de una URL amigable, para mostrar antes de guardar si está libre (FR-007). Es una
   * vista previa: la que decide es la reserva en el servidor, al confirmar.
   */
  findSlug(tenantId: TenantId, slug: Slug): Promise<SlugIndexEntry | null>;
}

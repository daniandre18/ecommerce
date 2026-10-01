import type { Product, ProductStatus, Tenant, TenantId } from '@ecommerce/domain';

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
  /** Prefijo del nombre; se compara normalizado, como `nameNormalized`. */
  readonly search?: string;
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
}

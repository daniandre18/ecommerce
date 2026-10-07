import type { TenantId } from '@ecommerce/domain';
import type { Firestore } from 'firebase-admin/firestore';

/**
 * Rutas de UN comercio. El `tenantId` se fija al construir, así que ningún repositorio puede armar
 * una ruta de otro comercio: el aislamiento es estructural también del lado del servidor (FR-002).
 */
export class TenantPaths {
  constructor(
    private readonly db: Firestore,
    readonly tenantId: TenantId,
  ) {}

  /** El documento del comercio mismo: `tenants/{tenantId}`. */
  tenantDoc() {
    return this.db.doc(`tenants/${this.tenantId}`);
  }

  collection(name: string) {
    return this.db.collection(`tenants/${this.tenantId}/${name}`);
  }

  doc(path: string) {
    return this.db.doc(`tenants/${this.tenantId}/${path}`);
  }

  // `storefront` tiene tres documentos de id fijo, y las reglas declaran exactamente esos tres
  // (specs/002-storefront-catalog/contracts/firestore-rules.md): uno nuevo no queda legible por
  // heredar la regla.

  /** El árbol de categorías entero, en un solo documento (research §1 de la 002). */
  categoryTreeDoc() {
    return this.doc('storefront/categoryTree');
  }

  /** Destacados y Ofertas: la lista ES el contador del tope (research §4 de la 002). */
  sectionsDoc() {
    return this.doc('storefront/sections');
  }

  /** Etiquetas y marcas del comercio, para sugerir (research §7 de la 002). */
  vocabularyDoc() {
    return this.doc('storefront/vocabulary');
  }

  /** La URL anterior de una categoría, reservada para ella (T110 de la 002): fuera del árbol. */
  categorySlugDoc(slug: string) {
    return this.doc(`categorySlugs/${slug}`);
  }

  /** Reserva de una URL amigable de producto. El `Slug` no admite `/`: es un solo segmento. */
  slugIndexDoc(slug: string) {
    return this.doc(`slugIndex/${slug}`);
  }

  /** Reserva de un GTIN, normalizado a 14 dígitos. */
  gtinIndexDoc(gtin14: string) {
    return this.doc(`gtinIndex/${gtin14}`);
  }
}

import type { CategoryId, OptionId, ProductId, TenantId, ValueId } from '../value-objects/ids';
import type { Slug } from '../value-objects/slug';

/** Tope de atributos de variación por producto (FR-025). */
export const MAX_OPTIONS = 5;
/** Tope de combinaciones por producto (FR-025). */
export const MAX_COMBINATIONS = 100;

/** Estados de publicación (FR-023a). Independientes de `archived`. */
export const PRODUCT_STATUSES = ['draft', 'active', 'unlisted'] as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Tope de peso de una imagen. `storage.rules` aplica el mismo número: si cambia, cambian los dos. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Tipos de imagen admitidos; `storage.rules` admite los mismos. SVG no: puede llevar código. */
export const IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'] as const;

export interface ImageRef {
  readonly storagePath: string;
  /** Obligatorio: WCAG 2.2 AA (FR-038a). */
  readonly alt: string;
  readonly position: number;
}

export interface OptionValue {
  readonly id: ValueId;
  readonly label: string;
  readonly position: number;
}

/** Atributo de variación, presentado en la interfaz como "opción" (FR-017). */
export interface VariationOption {
  readonly id: OptionId;
  /** Libre: color, tamaño, capacidad… */
  readonly name: string;
  readonly values: readonly OptionValue[];
  readonly position: number;
}

// ── Ficha de tienda (002-storefront-catalog) ──────────────────────────────────────────────────────

/** Topes de la ficha de tienda (FR-009, FR-011, FR-012, FR-022, FR-031). */
export const MAX_SEO_TITLE = 70;
export const MAX_SEO_DESCRIPTION = 160;
export const MAX_TAGS = 30;
export const MAX_TAG_LENGTH = 40;
export const MAX_BRAND_LENGTH = 70;
export const MAX_MPN_LENGTH = 70;
export const MAX_CATEGORIES_PER_PRODUCT = 20;

/** Físico o digital (FR-013). Un digital no se envía: no pide peso, dimensiones ni envío gratis. */
export const PRODUCT_KINDS = ['physical', 'digital'] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

/** Largo, ancho y alto en milímetros, enteros mayores que cero (FR-014). */
export interface Dimensions {
  readonly length: number;
  readonly width: number;
  readonly height: number;
}

/** Plataformas de video admitidas (FR-018, Assumptions del spec de la 002). */
export const VIDEO_PROVIDERS = ['youtube', 'vimeo'] as const;
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number];

/** Se guarda el id del video, no la URL: la tienda arma la incrustación. */
export interface ExternalVideo {
  readonly provider: VideoProvider;
  readonly videoId: string;
  /** En la misma secuencia que `images[].position`. */
  readonly position: number;
}

/**
 * Taxonomía de los catálogos de anuncios (FR-031): se guarda y se envía así. El panel presenta cada
 * valor como su rango legible ("0 a 3 meses" … "Adulto").
 */
export const AGE_GROUPS = ['newborn', 'infant', 'toddler', 'kids', 'adult'] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export const GENDERS = ['male', 'female', 'unisex'] as const;
export type Gender = (typeof GENDERS)[number];

/** Lo que la 002 suma al producto: lo que una tienda pública necesita para mostrarlo y encontrarlo. */
export interface StorefrontFields {
  /**
   * `null` SOLO si la migración de la 002 se interrumpió: el lector lo tolera, la interfaz no le da
   * estado propio (T042). Todo producto creado desde la 002 nace con su URL.
   */
  readonly slug: Slug | null;
  /** `true` tras editarla a mano o al publicarse por primera vez: deja de seguir al nombre (FR-008). */
  readonly slugLocked: boolean;
  /** La de respaldo de un nombre sin letras ni números, para reemplazar (FR-006). */
  readonly slugNeedsReplacement: boolean;
  /**
   * ¿Estuvo activo o no listado alguna vez? Decide qué pasa con una URL que deja de ser la vigente:
   * si nunca se publicó, se libera, porque nadie la enlazó; si sí, queda reservada para redirigir
   * (FR-008). No se deduce de `slugLocked`, que también se pone al editarla a mano.
   */
  readonly publishedOnce: boolean;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly tags: readonly string[];
  /** Para `array-contains`; misma forma que `nameNormalized`. */
  readonly tagsNormalized: readonly string[];
  readonly brand: string | null;
  readonly brandNormalized: string | null;
  readonly kind: ProductKind;
  /** Gramos, entero. `null` hasta cargarse. */
  readonly weightGrams: number | null;
  readonly dimensionsMm: Dimensions | null;
  /** Caché para el listado, como `hasIncompleteVariants` (FR-017). Nunca bloquea un cambio de estado. */
  readonly missingShippingData: boolean;
  readonly priceVisible: boolean;
  /** Se conserva aunque el producto sea digital: vuelve si pasa a físico (FR-016). */
  readonly freeShipping: boolean;
  readonly video: ExternalVideo | null;
  /** Solo las asignadas, nunca sus ancestros: mover una categoría no reescribe productos. */
  readonly categoryIds: readonly CategoryId[];
  readonly mpn: string | null;
  readonly ageGroup: AgeGroup | null;
  readonly gender: Gender | null;
}

/**
 * Los valores con que nace la ficha de tienda (FR-013, FR-026): físico, precio visible, sin envío
 * gratis, sin categorías. Son también los que reciben al leerse los productos anteriores a la 002.
 * `missingShippingData` es `true` porque un físico recién creado todavía no tiene peso.
 */
export function storefrontDefaults(): StorefrontFields {
  return {
    slug: null,
    slugLocked: false,
    slugNeedsReplacement: false,
    publishedOnce: false,
    seoTitle: null,
    seoDescription: null,
    tags: [],
    tagsNormalized: [],
    brand: null,
    brandNormalized: null,
    kind: 'physical',
    weightGrams: null,
    dimensionsMm: null,
    missingShippingData: true,
    priceVisible: true,
    freeShipping: false,
    video: null,
    categoryIds: [],
    mpn: null,
    ageGroup: null,
    gender: null,
  };
}

export interface Product extends StorefrontFields {
  readonly id: ProductId;
  readonly tenantId: TenantId;
  readonly name: string;
  /** Minúsculas y sin acentos, para la búsqueda por prefijo. */
  readonly nameNormalized: string;
  readonly description: string;
  readonly images: readonly ImageRef[];
  readonly options: readonly VariationOption[];
  readonly status: ProductStatus;
  readonly archived: boolean;
  readonly variantCount: number;
  /** Caché para listados y consultas. La fuente de verdad son las variantes. */
  readonly hasIncompleteVariants: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Control de concurrencia optimista (FR-027). */
  readonly version: number;
}

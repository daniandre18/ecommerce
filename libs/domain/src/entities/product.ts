import type { OptionId, ProductId, TenantId, ValueId } from '../value-objects/ids';

/** Tope de atributos de variación por producto (FR-025). */
export const MAX_OPTIONS = 5;
/** Tope de combinaciones por producto (FR-025). */
export const MAX_COMBINATIONS = 100;

/** Estados de publicación (FR-023a). Independientes de `archived`. */
export const PRODUCT_STATUSES = ['draft', 'active', 'unlisted'] as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

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

export interface Product {
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

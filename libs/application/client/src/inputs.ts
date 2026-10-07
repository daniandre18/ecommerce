import type { AgeGroup, Assignment, AuditEntryId, BatchId, CategoryId, Dimensions, Gender, ImageRef, Money, ProductId, ProductKind, ProductStatus, SaleConditionField, SaleConditionValue, SectionId, StockLevel, VariantId, VariationOption } from '@ecommerce/domain';

// Lo que viaja en cada comando del panel a las Functions: el contrato de las callable. Los casos de
// uso lo validan del lado del servidor; acá solo se declara, sin lógica, para que el panel lo use sin
// cargar el código del servidor (T103 de la 002).

/** Hasta cuántos productos admite una acción masiva (SC-007). */
export const MAX_BULK_PRODUCTS = 100;

export interface BulkCategoryInput {
  readonly categoryId: CategoryId;
  readonly productIds: readonly ProductId[];
}

export interface SetProductCategoriesInput {
  readonly productId: ProductId;
  /** Lo que agrega y lo que quita; nunca el conjunto completo, que pisaría una asignación masiva. */
  readonly add: readonly CategoryId[];
  readonly remove: readonly CategoryId[];
}

export interface SectionInput {
  readonly section: SectionId;
  readonly productIds: readonly ProductId[];
}

export interface SectionOutput {
  readonly section: SectionId;
  /** Cuántos lugares ocupa la sección ahora: el contador "33 de 40". */
  readonly count: number;
}

export interface SetSaleConditionsInput {
  readonly changes: readonly { readonly productId: ProductId; readonly version: number }[];
  /** Ausente, no se toca. */
  readonly priceVisible?: boolean;
  readonly freeShipping?: boolean;
}

export interface SetSaleConditionsOutput {
  readonly batchId: BatchId;
  /** Cuántos productos cambiaron; los que ya estaban así no cuentan. */
  readonly updated: number;
  readonly auditEntryIds: readonly AuditEntryId[];
}

export interface SetVariantGtinInput {
  readonly productId: ProductId;
  readonly variantId: VariantId;
  readonly version: number;
  /** El código como lo escribió la persona, o `null` para quitarlo. */
  readonly gtin: string | null;
}

export interface SetVariantShippingInput {
  readonly productId: ProductId;
  readonly changes: readonly {
    readonly variantId: VariantId;
    readonly version: number;
    /** Gramos; `null` vuelve a heredar el del producto; ausente, no cambia. */
    readonly weightGrams?: number | null;
    /** Milímetros; `null` vuelve a heredar las del producto; ausentes, no cambian. */
    readonly dimensionsMm?: Dimensions | null;
  }[];
}

export interface CreateCategoryInput {
  readonly parentId: CategoryId | null;
  readonly name: string;
  /** Escrita por el comercio; si falta, se genera del nombre con el menor sufijo libre (FR-021). */
  readonly slug?: string;
}

export interface MoveCategoryInput {
  readonly categoryId: CategoryId;
  readonly parentId: CategoryId | null;
  readonly position: number;
}

export interface CreateProductInput {
  readonly name: string;
  readonly description: string;
}

export interface SetProductOptionsInput {
  readonly productId: ProductId;
  readonly version: number;
  /** Estructura completa. Los ids de opciones y valores nuevos los propone el cliente. */
  readonly options: readonly VariationOption[];
  readonly assignments: readonly Assignment[];
}

export interface SetProductOptionsOutput {
  readonly version: number;
  readonly created: readonly VariantId[];
  readonly preserved: readonly VariantId[];
  readonly archived: readonly VariantId[];
  readonly discarded: readonly VariantId[];
}

export interface SetProductStatusInput {
  readonly productId: ProductId;
  readonly version: number;
  readonly status: ProductStatus;
}

/** Resultado común: cuántas variantes cambiaron y las entradas de bitácora que dejaron. */
export interface AmountsOutput {
  readonly batchId: BatchId;
  readonly updated: number;
  readonly auditEntryIds: readonly AuditEntryId[];
}

export interface SetVariantCostInput {
  readonly productId: ProductId;
  readonly changes: readonly { readonly variantId: VariantId; readonly cost: Money }[];
}

export interface SetVariantPriceInput {
  readonly productId: ProductId;
  readonly changes: readonly {
    readonly variantId: VariantId;
    readonly version: number;
    readonly price?: Money;
    /** `null` quita el precio tachado. */
    readonly compareAtPrice?: Money | null;
  }[];
}

export interface SetVariantStockInput {
  readonly productId: ProductId;
  readonly changes: readonly { readonly variantId: VariantId; readonly version: number; readonly stock: StockLevel }[];
}

export interface SetVariantImagesInput {
  readonly productId: ProductId;
  readonly variantId: VariantId;
  readonly version: number;
  /** Lista completa, en orden. Quitar una imagen es no incluirla: el archivo no se borra. */
  readonly images: readonly ImageRef[];
}

export interface SetVariantSkuInput {
  readonly productId: ProductId;
  readonly variantId: VariantId;
  readonly version: number;
  readonly sku: string;
}

export interface SetProductShippingInput {
  readonly productId: ProductId;
  readonly version: number;
  /** Gramos; `null` lo quita. */
  readonly weightGrams: number | null;
  /** Milímetros; `null` las quita. */
  readonly dimensionsMm: Dimensions | null;
}

export interface SetProductSlugInput {
  readonly productId: ProductId;
  readonly version: number;
  /** Lo que escribió el comercio; se normaliza con las mismas reglas que la generada (FR-007). */
  readonly slug: string;
}

/** Lo que cambió para el comprador: lo mismo que quedó en la bitácora. */
export interface BuyerChange {
  readonly field: SaleConditionField;
  readonly before: SaleConditionValue;
  readonly after: SaleConditionValue;
}

export interface SetProductTypeInput {
  readonly productId: ProductId;
  readonly version: number;
  readonly kind: ProductKind;
}

export interface UpdateProductDetailsInput {
  readonly productId: ProductId;
  readonly version: number;
  readonly name?: string;
  readonly description?: string;
  readonly images?: readonly ImageRef[];
  // Ficha de tienda (002): lo que no viene, no cambia.
  readonly seoTitle?: string | null;
  readonly seoDescription?: string | null;
  readonly tags?: readonly string[];
  readonly brand?: string | null;
  /** Un enlace de YouTube o Vimeo con su lugar entre las imágenes, o `null` para quitarlo. */
  readonly video?: { readonly url: string; readonly position: number } | null;
  // Catálogos externos (002, Historia 4, FR-031): `null` los quita.
  readonly mpn?: string | null;
  readonly ageGroup?: AgeGroup | null;
  readonly gender?: Gender | null;
}

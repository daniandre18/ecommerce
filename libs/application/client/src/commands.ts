import type { CategoryId, ProductId, Slug, TenantId, VariantId } from '@ecommerce/domain';
import type {
  AmountsOutput,
  BulkCategoryInput,
  BuyerChange,
  CreateCategoryInput,
  CreateProductInput,
  MoveCategoryInput,
  SectionInput,
  SectionOutput,
  SetProductCategoriesInput,
  SetProductOptionsInput,
  SetProductOptionsOutput,
  SetProductShippingInput,
  SetProductSlugInput,
  SetProductStatusInput,
  SetProductTypeInput,
  SetSaleConditionsInput,
  SetSaleConditionsOutput,
  SetVariantCostInput,
  SetVariantGtinInput,
  SetVariantImagesInput,
  SetVariantPriceInput,
  SetVariantShippingInput,
  SetVariantSkuInput,
  SetVariantStockInput,
  UpdateProductDetailsInput,
} from './inputs';

/** Códigos del contrato de las callable (`contracts/callable-functions.md`). */
export type BusinessErrorCode =
  | 'not-found'
  | 'version-conflict' // FR-027
  | 'sku-conflict' // FR-021
  | 'limit-exceeded' // FR-025
  | 'incomplete-variants' // FR-023a
  | 'invalid-argument'
  // 002-storefront-catalog
  | 'slug-conflict' // FR-007: la URL está en uso o reservada
  | 'gtin-conflict' // FR-030
  | 'invalid-gtin' // FR-030
  | 'unsupported-video' // FR-018
  | 'category-limit' // FR-019: profundidad, ciclo o tope de categorías
  | 'category-name-taken' // FR-020
  | 'category-has-children' // FR-024
  | 'section-full' // FR-027b
  | 'digital-products'; // FR-029
/** Códigos que viajan en la envoltura `{ ok: false }` de las callable (`contracts/callable-functions.md`). */
export type EnvelopeErrorCode = BusinessErrorCode | 'audit-write-failed';

/** Códigos que cortan antes del caso de uso: la guarda del servidor, o la red. */
export type GateErrorCode = 'unauthenticated' | 'failed-precondition' | 'permission-denied' | 'unavailable' | 'internal';

export type CommandErrorCode = EnvelopeErrorCode | GateErrorCode;

export interface CommandFailure<C extends string = CommandErrorCode> {
  readonly ok: false;
  readonly code: C;
  readonly message: string;
  readonly details?: unknown;
}

/** Resultado de una orden al servidor. Las Functions devuelven el subconjunto `EnvelopeErrorCode`. */
export type CommandResult<T, C extends string = CommandErrorCode> = { readonly ok: true; readonly data: T } | CommandFailure<C>;

type Version = { readonly version: number };
type Done = Record<string, never>;

/**
 * Las órdenes de catálogo que el panel envía al servidor, una por callable. Toda escritura pasa por
 * acá: el cliente nunca escribe en Firestore.
 */
export interface CatalogCommands {
  /** `requestId` lo genera quien inicia la creación y se reusa en los reintentos: así no se duplica. */
  createProduct(
    tenantId: TenantId,
    input: CreateProductInput & { readonly requestId: string },
  ): Promise<CommandResult<{ readonly productId: ProductId; readonly variantId: VariantId; readonly slug: Slug | null }>>;
  updateProductDetails(tenantId: TenantId, input: UpdateProductDetailsInput): Promise<CommandResult<Version>>;
  setProductOptions(tenantId: TenantId, input: SetProductOptionsInput): Promise<CommandResult<SetProductOptionsOutput>>;
  setProductStatus(tenantId: TenantId, input: SetProductStatusInput): Promise<CommandResult<Version>>;
  setVariantSku(tenantId: TenantId, input: SetVariantSkuInput): Promise<CommandResult<Version & { readonly complete: boolean }>>;
  setVariantImages(tenantId: TenantId, input: SetVariantImagesInput): Promise<CommandResult<Version>>;
  archiveProduct(tenantId: TenantId, input: { readonly productId: ProductId } & Version): Promise<CommandResult<Version>>;
  archiveVariant(
    tenantId: TenantId,
    input: { readonly productId: ProductId; readonly variantId: VariantId } & Version,
  ): Promise<CommandResult<Version>>;
  setVariantPrice(tenantId: TenantId, input: SetVariantPriceInput): Promise<CommandResult<AmountsOutput>>;
  setVariantCost(tenantId: TenantId, input: SetVariantCostInput): Promise<CommandResult<AmountsOutput>>;
  setVariantStock(tenantId: TenantId, input: SetVariantStockInput): Promise<CommandResult<AmountsOutput>>;
  // Ficha de tienda (002)
  /** Devuelve la URL final: la normalizada, que puede no ser la escrita (FR-007). */
  setProductSlug(tenantId: TenantId, input: SetProductSlugInput): Promise<CommandResult<Version & { readonly slug: Slug }>>;
  setProductShipping(tenantId: TenantId, input: SetProductShippingInput): Promise<CommandResult<Version>>;
  /** Devuelve lo que cambió para el comprador, lo mismo que quedó en la bitácora (FR-016, FR-032). */
  setProductType(tenantId: TenantId, input: SetProductTypeInput): Promise<CommandResult<Version & { readonly changes: readonly BuyerChange[] }>>;
  // Categorías (002, Historia 2). Ninguna lleva versión: las del árbol son de intención y se validan
  // contra el árbol fresco; las de asignación son de conjunto y conmutan (research §1 y §2).
  /** `requestId`, como al crear un producto: el reintento no duplica la categoría. */
  createCategory(
    tenantId: TenantId,
    input: CreateCategoryInput & { readonly requestId: string },
  ): Promise<CommandResult<{ readonly categoryId: CategoryId; readonly slug: Slug }>>;
  renameCategory(tenantId: TenantId, input: { readonly categoryId: CategoryId; readonly name: string }): Promise<CommandResult<Done>>;
  setCategorySlug(tenantId: TenantId, input: { readonly categoryId: CategoryId; readonly slug: string }): Promise<CommandResult<{ readonly slug: Slug }>>;
  moveCategory(tenantId: TenantId, input: MoveCategoryInput): Promise<CommandResult<Done>>;
  setCategoryHidden(tenantId: TenantId, input: { readonly categoryId: CategoryId; readonly hidden: boolean }): Promise<CommandResult<Done>>;
  deleteCategory(tenantId: TenantId, input: { readonly categoryId: CategoryId }): Promise<CommandResult<Done>>;
  /** Lo que agrega y lo que quita, nunca el conjunto completo. */
  setProductCategories(tenantId: TenantId, input: SetProductCategoriesInput): Promise<CommandResult<{ readonly categoryIds: readonly CategoryId[] }>>;
  assignCategory(tenantId: TenantId, input: BulkCategoryInput): Promise<CommandResult<{ readonly changed: number }>>;
  unassignCategory(tenantId: TenantId, input: BulkCategoryInput): Promise<CommandResult<{ readonly changed: number }>>;
  // Historia 3: cómo se ofrece cada producto.
  /** Precio visible y envío gratis; exige `variant.price.write` y deja su bitácora (FR-003, FR-032). */
  setSaleConditions(tenantId: TenantId, input: SetSaleConditionsInput): Promise<CommandResult<SetSaleConditionsOutput>>;
  addToSection(tenantId: TenantId, input: SectionInput): Promise<CommandResult<SectionOutput>>;
  removeFromSection(tenantId: TenantId, input: SectionInput): Promise<CommandResult<SectionOutput>>;
  // Historia 4: datos por variante.
  /** `gtin-conflict` nombra el producto que lo tiene y si está archivado (FR-030). */
  setVariantGtin(tenantId: TenantId, input: SetVariantGtinInput): Promise<CommandResult<Version>>;
  setVariantShipping(tenantId: TenantId, input: SetVariantShippingInput): Promise<CommandResult<{ readonly versions: Readonly<Record<VariantId, number>> }>>;
}

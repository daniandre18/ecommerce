import type { ProductId, TenantId, VariantId } from '@ecommerce/domain';
import type { BusinessErrorCode } from '../errors';
import type { CreateProductInput } from '../use-cases/create-product';
import type { SetProductOptionsInput, SetProductOptionsOutput } from '../use-cases/set-product-options';
import type { SetProductStatusInput } from '../use-cases/set-product-status';
import type {
  AmountsOutput,
  SetVariantCostInput,
  SetVariantPriceInput,
  SetVariantStockInput,
} from '../use-cases/set-variant-amounts';
import type { SetVariantImagesInput } from '../use-cases/set-variant-images';
import type { SetVariantSkuInput } from '../use-cases/set-variant-sku';
import type { UpdateProductDetailsInput } from '../use-cases/update-product-details';

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

/**
 * Las órdenes de catálogo que el panel envía al servidor, una por callable. Toda escritura pasa por
 * acá: el cliente nunca escribe en Firestore.
 */
export interface CatalogCommands {
  /** `requestId` lo genera quien inicia la creación y se reusa en los reintentos: así no se duplica. */
  createProduct(
    tenantId: TenantId,
    input: CreateProductInput & { readonly requestId: string },
  ): Promise<CommandResult<{ readonly productId: ProductId; readonly variantId: VariantId }>>;
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
}

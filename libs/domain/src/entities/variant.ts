import type { OptionId, ProductId, TenantId, ValueId, VariantId } from '../value-objects/ids';
import type { Money } from '../value-objects/money';
import type { Sku } from '../value-objects/sku';
import { stockUndefined, type StockLevel } from '../value-objects/stock-level';
import type { ImageRef } from './product';

/**
 * Valor elegido para cada opción del producto. `{}` es la variante implícita de un producto sin
 * opciones (FR-020): el resto del sistema no la distingue de ninguna otra.
 */
export type Combination = Readonly<Record<OptionId, ValueId>>;

/**
 * Unidad de venta y de inventario. El costo de adquisición NO está acá: Firestore no protege campos
 * sueltos, así que vive en otro documento con su propia regla (FR-015).
 */
export interface Variant {
  readonly id: VariantId;
  readonly tenantId: TenantId;
  readonly productId: ProductId;
  readonly optionValues: Combination;
  readonly sku: Sku | null;
  /** Precio de venta. `null` = sin definir. */
  readonly price: Money | null;
  /** Precio comparativo, el valor que se muestra tachado. */
  readonly compareAtPrice: Money | null;
  readonly stock: StockLevel;
  readonly images: readonly ImageRef[];
  readonly archived: boolean;
  /** Control de concurrencia optimista (FR-027). */
  readonly version: number;
}

/**
 * Una variante está lista para la venta cuando tiene SKU (FR-024). Se calcula en lugar de
 * guardarse, para que nunca pueda contradecir al SKU.
 */
export function isVariantComplete(variant: Variant): boolean {
  return variant.sku !== null;
}

/**
 * ¿Tiene la variante algo que valga la pena preservar? Una variante sin datos no tiene SKU que
 * reservar ni cambios de precio o stock en la bitácora.
 */
export function hasVariantData(variant: Variant): boolean {
  return (
    variant.sku !== null ||
    variant.price !== null ||
    variant.compareAtPrice !== null ||
    variant.stock.kind !== 'undefined' ||
    variant.images.length > 0
  );
}

/**
 * Una variante recién generada nace incompleta: sin SKU, sin precio y SIN existencias definidas,
 * que no es lo mismo que cero (FR-024, FR-029).
 */
export function createIncompleteVariant(input: {
  id: VariantId;
  tenantId: TenantId;
  productId: ProductId;
  optionValues: Combination;
}): Variant {
  return Object.freeze({
    ...input,
    optionValues: Object.freeze({ ...input.optionValues }),
    sku: null,
    price: null,
    compareAtPrice: null,
    stock: stockUndefined(),
    images: Object.freeze([]),
    archived: false,
    version: 0,
  });
}

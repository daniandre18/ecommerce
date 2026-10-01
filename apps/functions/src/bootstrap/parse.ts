import type {
  CreateProductInput,
  SetProductOptionsInput,
  SetProductStatusInput,
  SetVariantCostInput,
  SetVariantImagesInput,
  SetVariantPriceInput,
  SetVariantSkuInput,
  SetVariantStockInput,
  UpdateProductDetailsInput,
} from '@ecommerce/application';
import {
  optionId,
  PRODUCT_STATUSES,
  productId,
  valueId,
  variantId,
  type ProductId,
  type VariantId,
} from '@ecommerce/domain';
import { JsonObject } from './json';

// Borde de las callable: el JSON del cliente se convierte en la entrada de un caso de uso o se
// rechaza con `invalid-argument`, nombrando el campo. Cada objeto se arma campo por campo, así que
// nada que no esté en el contrato llega a los casos de uso. `tenantId` y `requestId` no se leen
// acá: los verifica la guarda.

export function parseCreateProduct(data: unknown): CreateProductInput {
  const json = JsonObject.payload(data);
  return { name: json.string('name'), description: json.has('description') ? json.string('description') : '' };
}

export function parseUpdateProductDetails(data: unknown): UpdateProductDetailsInput {
  const json = JsonObject.payload(data);
  return {
    productId: json.id('productId', productId),
    version: json.integer('version'),
    ...json.optional('name', (key) => json.string(key)),
    ...json.optional('description', (key) => json.string(key)),
    ...json.optional('images', () => imagesOf(json)),
  };
}

/** La posición de cada opción y de cada valor es su lugar en la lista. */
export function parseSetProductOptions(data: unknown): SetProductOptionsInput {
  const json = JsonObject.payload(data);
  return {
    productId: json.id('productId', productId),
    version: json.integer('version'),
    options: json.objects('options', (option, position) => ({
      id: option.id('id', optionId),
      name: option.string('name'),
      position,
      values: option.objects('values', (value, valuePosition) => ({
        id: value.id('id', valueId),
        label: value.string('label'),
        position: valuePosition,
      })),
    })),
    assignments: json.has('assignments')
      ? json.objects('assignments', (assignment) => ({
          variantId: assignment.id('variantId', variantId),
          optionId: assignment.id('optionId', optionId),
          valueId: assignment.id('valueId', valueId),
        }))
      : [],
  };
}

export function parseSetProductStatus(data: unknown): SetProductStatusInput {
  const json = JsonObject.payload(data);
  return { productId: json.id('productId', productId), version: json.integer('version'), status: json.oneOf('status', PRODUCT_STATUSES) };
}

export function parseSetVariantSku(data: unknown): SetVariantSkuInput {
  const json = JsonObject.payload(data);
  return { ...variantRef(json), sku: json.string('sku') };
}

export function parseSetVariantImages(data: unknown): SetVariantImagesInput {
  const json = JsonObject.payload(data);
  return { ...variantRef(json), images: imagesOf(json) };
}

export function parseArchiveProduct(data: unknown): { productId: ProductId; version: number } {
  const json = JsonObject.payload(data);
  return { productId: json.id('productId', productId), version: json.integer('version') };
}

export function parseArchiveVariant(data: unknown): { productId: ProductId; variantId: VariantId; version: number } {
  return variantRef(JsonObject.payload(data));
}

export function parseSetVariantPrice(data: unknown): SetVariantPriceInput {
  const json = JsonObject.payload(data);
  return {
    productId: json.id('productId', productId),
    changes: json.objects('changes', (change) => ({
      variantId: change.id('variantId', variantId),
      version: change.integer('version'),
      ...change.optional('price', (key) => change.money(key)),
      // `null` quita el precio tachado; ausente lo deja como está.
      ...change.optional('compareAtPrice', (key) => (change.isNull(key) ? null : change.money(key))),
    })),
  };
}

export function parseSetVariantCost(data: unknown): SetVariantCostInput {
  const json = JsonObject.payload(data);
  return {
    productId: json.id('productId', productId),
    changes: json.objects('changes', (change) => ({ variantId: change.id('variantId', variantId), cost: change.money('cost') })),
  };
}

export function parseSetVariantStock(data: unknown): SetVariantStockInput {
  const json = JsonObject.payload(data);
  return {
    productId: json.id('productId', productId),
    changes: json.objects('changes', (change) => ({
      variantId: change.id('variantId', variantId),
      version: change.integer('version'),
      stock: change.stock('stock'),
    })),
  };
}

/** El orden de la lista es el orden de las imágenes. */
function imagesOf(json: JsonObject) {
  return json.objects('images', (image, position) => ({ storagePath: image.string('storagePath'), alt: image.string('alt'), position }));
}

function variantRef(json: JsonObject) {
  return { productId: json.id('productId', productId), variantId: json.id('variantId', variantId), version: json.integer('version') };
}

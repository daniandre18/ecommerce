import {
  BusinessRuleError,
  type CreateProductInput,
  type SetProductOptionsInput,
  type SetProductStatusInput,
  type SetVariantCostInput,
  type SetVariantImagesInput,
  type SetVariantPriceInput,
  type SetVariantSkuInput,
  type SetVariantStockInput,
  type UpdateProductDetailsInput,
} from '@ecommerce/application';
import {
  InvalidIdentifierError,
  InvalidMoneyError,
  InvalidStockError,
  money,
  optionId,
  PRODUCT_STATUSES,
  productId,
  stockQuantity,
  stockUndefined,
  valueId,
  variantId,
  type Money,
  type ProductId,
  type StockLevel,
  type VariantId,
} from '@ecommerce/domain';

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

/** Un objeto que mandó el cliente, con la ruta por la que se llegó a él para nombrar el campo que falla. */
class JsonObject {
  private constructor(
    private readonly data: Readonly<Record<string, unknown>>,
    private readonly path: string,
  ) {}

  static payload(data: unknown): JsonObject {
    return JsonObject.at(data, '');
  }

  private static at(value: unknown, path: string): JsonObject {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) reject(path || '(carga útil)', 'se esperaba un objeto');
    return new JsonObject(value as Record<string, unknown>, path);
  }

  has(key: string): boolean {
    return this.data[key] !== undefined;
  }

  isNull(key: string): boolean {
    return this.data[key] === null;
  }

  /** Para un campo opcional: el resultado se esparce, así un campo ausente no aparece como `undefined`. */
  optional<K extends string, T>(key: K, read: (key: K) => T): { [P in K]?: T } {
    return (this.has(key) ? { [key]: read(key) } : {}) as { [P in K]?: T };
  }

  string(key: string): string {
    const value = this.data[key];
    if (typeof value !== 'string') reject(this.field(key), 'se esperaba un texto');
    return value;
  }

  integer(key: string): number {
    const value = this.data[key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) reject(this.field(key), 'se esperaba un número entero');
    return value;
  }

  oneOf<T extends string>(key: string, allowed: readonly T[]): T {
    const value = this.string(key);
    if (!(allowed as readonly string[]).includes(value)) reject(this.field(key), `se esperaba uno de: ${allowed.join(', ')}`);
    return value as T;
  }

  /** Un identificador de dominio: un único segmento de ruta, porque con él se arman rutas. */
  id<T>(key: string, factory: (raw: string) => T): T {
    const raw = this.string(key);
    return fromDomain(this.field(key), () => factory(raw));
  }

  /** Importe entero en la unidad mínima de la moneda, nunca negativo. */
  money(key: string): Money {
    const value = this.object(key);
    const amount = value.integer('amount');
    const currency = value.string('currency');
    return fromDomain(this.field(key), () => money(amount, currency));
  }

  /** "Sin definir" y cero son estados distintos (FR-029). */
  stock(key: string): StockLevel {
    const value = this.object(key);
    const kind = value.oneOf('kind', ['undefined', 'quantity']);
    if (kind === 'undefined') return stockUndefined();
    const quantity = value.integer('value');
    return fromDomain(this.field(key), () => stockQuantity(quantity));
  }

  /** Una lista de objetos. El índice le sirve al llamador para derivar posiciones. */
  objects<T>(key: string, item: (entry: JsonObject, index: number) => T): T[] {
    const value = this.data[key];
    if (!Array.isArray(value)) reject(this.field(key), 'se esperaba una lista');
    return value.map((entry, index) => item(JsonObject.at(entry, `${this.field(key)}[${index}]`), index));
  }

  private object(key: string): JsonObject {
    return JsonObject.at(this.data[key], this.field(key));
  }

  private field(key: string): string {
    return this.path === '' ? key : `${this.path}.${key}`;
  }
}

function reject(field: string, problem: string): never {
  throw new BusinessRuleError('invalid-argument', `${field}: ${problem}`, { field });
}

/** Las factorías del dominio validan; acá su rechazo se traduce al código del contrato. */
function fromDomain<T>(field: string, build: () => T): T {
  try {
    return build();
  } catch (error) {
    if (error instanceof InvalidIdentifierError || error instanceof InvalidMoneyError || error instanceof InvalidStockError) {
      reject(field, error.message);
    }
    throw error;
  }
}

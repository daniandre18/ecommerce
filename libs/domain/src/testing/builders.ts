import type { VariationOption } from '../entities/product';
import { createIncompleteVariant, type Combination, type Variant } from '../entities/variant';
import { optionId, productId, tenantId, valueId, variantId } from '../value-objects/ids';
import { money } from '../value-objects/money';
import { normalizeSku } from '../value-objects/sku';
import { stockQuantity } from '../value-objects/stock-level';

// Los ids se derivan del texto sin espacios al borde, para poder construir etiquetas inválidas
// (' Rojo ', '  ') y probar que las rechaza el validador y no el constructor de ids.
const optionKey = (name: string) => name.trim() || 'blank';
const valueKey = (name: string, label: string) => `${optionKey(name)}:${label.trim()}`;

/**
 * `option('color', ['Rojo', 'Amarillo'])` → ids `color`, `color:Rojo`, `color:Amarillo`. Una
 * etiqueta repetida recibe un id distinto (`color:Rojo#1`), como pasaría con los UUID reales: así
 * las pruebas de etiquetas repetidas no chocan antes con la de ids repetidos.
 */
export function option(name: string, labels: readonly string[], position = 0): VariationOption {
  const used = new Set<string>();
  return {
    id: optionId(optionKey(name)),
    name,
    position,
    values: labels.map((label, index) => {
      const base = valueKey(name, label);
      const key = used.has(base) ? `${base}#${index}` : base;
      used.add(key);
      return { id: valueId(key), label, position: index };
    }),
  };
}

/** `combo({ color: 'Rojo', size: 'S' })` → `{ color: 'color:Rojo', size: 'size:S' }`. */
export function combo(values: Readonly<Record<string, string>>): Combination {
  return Object.fromEntries(
    Object.entries(values).map(([name, label]) => [optionId(optionKey(name)), valueId(valueKey(name, label))]),
  );
}

export function emptyVariant(id: string, values: Readonly<Record<string, string>> = {}): Variant {
  return createIncompleteVariant({
    id: variantId(id),
    tenantId: tenantId('t1'),
    productId: productId('p1'),
    optionValues: combo(values),
  });
}

/** Variante con SKU, precio y stock cargados: lo que FR-024 obliga a preservar. */
export function loadedVariant(id: string, values: Readonly<Record<string, string>> = {}): Variant {
  return {
    ...emptyVariant(id, values),
    sku: normalizeSku(`SKU-${id}`),
    price: money(1000, 'USD'),
    compareAtPrice: money(1500, 'USD'),
    stock: stockQuantity(7),
    images: [{ storagePath: `img/${id}.jpg`, alt: `Foto de ${id}`, position: 0 }],
  };
}

/** Generador de ids determinista para las pruebas: `new-1`, `new-2`… */
export function sequentialIds(prefix = 'new') {
  let n = 0;
  return () => variantId(`${prefix}-${++n}`);
}

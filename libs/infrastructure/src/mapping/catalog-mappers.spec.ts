import {
  categoryId,
  productId,
  stockUndefined,
  tenantId,
  variantId,
  type Gtin,
  type Product,
  type Slug,
  type Variant,
} from '@ecommerce/domain';
import { describe, expect, it } from 'vitest';
import { productFromDoc, productToDoc, variantFromDoc, variantToDoc } from './catalog-mappers';

const AT = new Date('2026-10-05T12:00:00Z');

/** Un producto tal como lo guardaba la 001: sin ningún campo de la 002. */
const PRODUCT_001 = {
  name: 'Camiseta',
  nameNormalized: 'camiseta',
  description: '',
  images: [],
  options: [],
  status: 'active',
  archived: false,
  variantCount: 1,
  hasIncompleteVariants: false,
  createdAt: AT,
  updatedAt: AT,
  version: 3,
};

/** Una variante tal como la guardaba la 001. */
const VARIANT_001 = {
  optionValues: {},
  sku: { raw: 'ABC-1', normalized: 'ABC-1' },
  price: { amount: 52000, currency: 'COP' },
  compareAtPrice: null,
  stock: { kind: 'quantity', value: 4 },
  images: [],
  archived: false,
  version: 2,
};

// T010 — productos y variantes guardados ANTES de la 002 se leen con valores por defecto: ninguno se
// rompe entre el despliegue y la migración (research §12 de la 002).
describe('lectura de un producto anterior a la 002', () => {
  const product = productFromDoc('p1', 't1', PRODUCT_001);

  it('toma los valores por defecto de la ficha de tienda', () => {
    expect(product).toEqual(
      expect.objectContaining({
        kind: 'physical',
        priceVisible: true,
        freeShipping: false,
        categoryIds: [],
        tags: [],
        tagsNormalized: [],
        brand: null,
        brandNormalized: null,
        seoTitle: null,
        seoDescription: null,
        video: null,
        weightGrams: null,
        dimensionsMm: null,
        mpn: null,
        ageGroup: null,
        gender: null,
        slugLocked: false,
        slugNeedsReplacement: false,
      }),
    );
  });

  // Ese `slug: null` es DEFENSA ante una migración interrumpida, no un estado del producto: el mapeador
  // lo entrega sin lanzar, y ninguna vista le da aviso ni estado propio (T042).
  it('sin URL todavía: la entrega nula sin lanzar', () => {
    expect(product.slug).toBeNull();
  });

  it('un físico sin peso ni dimensiones cuenta como "faltan datos de envío" (FR-017)', () => {
    expect(product.missingShippingData).toBe(true);
  });

  it('conserva todo lo que ya tenía', () => {
    expect(product).toEqual(expect.objectContaining({ name: 'Camiseta', status: 'active', version: 3 }));
  });
});

describe('lectura de una variante anterior a la 002', () => {
  it('sin GTIN, y hereda peso y dimensiones del producto', () => {
    expect(variantFromDoc('v1', 't1', 'p1', VARIANT_001)).toEqual(
      expect.objectContaining({ gtin: null, weightGrams: null, dimensionsMm: null }),
    );
  });
});

describe('ida y vuelta de los campos de la 002', () => {
  const full: Product = {
    ...productFromDoc('p1', 't1', PRODUCT_001),
    slug: 'camiseta-basica' as Slug,
    slugLocked: true,
    slugNeedsReplacement: false,
    seoTitle: 'Camiseta básica de algodón',
    seoDescription: 'Algodón peinado, cuello redondo.',
    tags: ['Verano', 'Algodón'],
    tagsNormalized: ['verano', 'algodon'],
    brand: 'Nativa',
    brandNormalized: 'nativa',
    kind: 'physical',
    weightGrams: 300,
    dimensionsMm: { length: 300, width: 200, height: 20 },
    missingShippingData: false,
    priceVisible: false,
    freeShipping: true,
    video: { provider: 'youtube', videoId: 'dQw4w9WgXcQ', position: 2 },
    categoryIds: [categoryId('c1'), categoryId('c2')],
    mpn: 'NAT-CB-01',
    ageGroup: 'adult',
    gender: 'unisex',
  };

  it('el producto vuelve igual', () => {
    expect(productFromDoc('p1', 't1', productToDoc(full))).toEqual(full);
  });

  it('la variante vuelve igual', () => {
    const variant: Variant = {
      id: variantId('v1'),
      tenantId: tenantId('t1'),
      productId: productId('p1'),
      optionValues: {},
      sku: null,
      price: null,
      compareAtPrice: null,
      stock: stockUndefined(),
      images: [],
      archived: false,
      version: 1,
      gtin: { raw: '7501031311309', normalized: '07501031311309' } as Gtin,
      weightGrams: 450,
      dimensionsMm: { length: 600, width: 400, height: 30 },
    };
    expect(variantFromDoc('v1', 't1', 'p1', variantToDoc(variant))).toEqual(variant);
  });
});

// Como en la 001: un documento corrupto falla fuerte en lugar de colarse como un valor inválido.
describe('valores fuera de las listas cerradas', () => {
  it.each([
    ['tipo', { kind: 'liquido' }],
    ['rango de edad', { ageGroup: 'teen' }],
    ['género', { gender: 'otro' }],
    ['proveedor de video', { video: { provider: 'dailymotion', videoId: 'x', position: 0 } }],
  ])('rechaza un %s desconocido', (_label, field) => {
    expect(() => productFromDoc('p1', 't1', { ...PRODUCT_001, ...field })).toThrow(TypeError);
  });
});

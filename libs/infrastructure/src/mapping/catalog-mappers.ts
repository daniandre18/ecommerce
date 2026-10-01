import type { SkuIndexEntry } from '@ecommerce/application';
import {
  money,
  optionId,
  productId,
  stockQuantity,
  stockUndefined,
  tenantId,
  uid,
  valueId,
  variantId,
  type Combination,
  type CurrencyCode,
  type ImageRef,
  type Money,
  type PlatformOperatorId,
  type Product,
  type ProductStatus,
  type Sku,
  type StockLevel,
  type Tenant,
  type Variant,
  type VariantId,
  type VariationOption,
} from '@ecommerce/domain';
import { toDate, type DocumentData } from './document';

// Lectura: los datos se reconstruyen con las factorías del dominio, así un documento corrupto falla
// fuerte en lugar de colarse como un valor inválido. Escritura: cada campo se enumera, así un campo
// nuevo del dominio no llega a Firestore hasta que alguien decide guardarlo.

export function tenantFromDoc(id: string, d: DocumentData): Tenant {
  return {
    id: tenantId(id),
    name: String(d['name'] ?? ''),
    ownerUid: uid(String(d['ownerUid'])),
    currency: String(d['currency']) as CurrencyCode,
    createdAt: toDate(d['createdAt']),
    createdBy: String(d['createdBy']) as PlatformOperatorId,
    status: d['status'] === 'suspended' ? 'suspended' : 'active',
  };
}

/** Campos persistidos, enumerados a propósito. El `id` está en la ruta. */
export function tenantToDoc(t: Tenant): DocumentData {
  return { name: t.name, ownerUid: t.ownerUid, currency: t.currency, createdAt: t.createdAt, createdBy: t.createdBy, status: t.status };
}

export function productFromDoc(id: string, tid: string, d: DocumentData): Product {
  return {
    id: productId(id),
    tenantId: tenantId(tid),
    name: String(d['name']),
    nameNormalized: String(d['nameNormalized']),
    description: String(d['description'] ?? ''),
    images: imagesFromDoc(d['images']),
    options: ((d['options'] ?? []) as DocumentData[]).map(optionFromDoc),
    status: d['status'] as ProductStatus,
    archived: d['archived'] === true,
    variantCount: Number(d['variantCount'] ?? 0),
    hasIncompleteVariants: d['hasIncompleteVariants'] === true,
    createdAt: toDate(d['createdAt']),
    updatedAt: toDate(d['updatedAt']),
    version: Number(d['version']),
  };
}

export function productToDoc(p: Product): DocumentData {
  return {
    name: p.name,
    nameNormalized: p.nameNormalized,
    description: p.description,
    images: p.images.map(imageToDoc),
    options: p.options.map((option) => ({
      id: option.id,
      name: option.name,
      position: option.position,
      values: option.values.map((value) => ({ id: value.id, label: value.label, position: value.position })),
    })),
    status: p.status,
    archived: p.archived,
    variantCount: p.variantCount,
    hasIncompleteVariants: p.hasIncompleteVariants,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    version: p.version,
  };
}

export function variantFromDoc(id: string, tid: string, pid: string, d: DocumentData): Variant {
  return {
    id: variantId(id),
    tenantId: tenantId(tid),
    productId: productId(pid),
    optionValues: combinationFromDoc(d['optionValues']),
    sku: skuFromDoc(d['sku']),
    price: moneyFromDoc(d['price']),
    compareAtPrice: moneyFromDoc(d['compareAtPrice']),
    stock: stockFromDoc(d['stock']),
    images: imagesFromDoc(d['images']),
    archived: d['archived'] === true,
    version: Number(d['version']),
  };
}

/** El costo NO se guarda acá: vive en su documento aparte, con su propia regla (FR-015). */
export function variantToDoc(v: Variant): DocumentData {
  return {
    optionValues: { ...v.optionValues },
    sku: v.sku && { raw: v.sku.raw, normalized: v.sku.normalized },
    price: moneyToDoc(v.price),
    compareAtPrice: moneyToDoc(v.compareAtPrice),
    stock: v.stock.kind === 'quantity' ? { kind: 'quantity', value: v.stock.value } : { kind: 'undefined' },
    images: v.images.map(imageToDoc),
    archived: v.archived,
    version: v.version,
  };
}

export function skuIndexFromDoc(d: DocumentData): SkuIndexEntry {
  const sku = skuFromDoc(d['sku']);
  if (!sku) throw new TypeError('Entrada de skuIndex sin SKU');
  return {
    sku,
    variantId: variantId(String(d['variantId'])),
    productId: productId(String(d['productId'])),
    archived: d['archived'] === true,
  };
}

function optionFromDoc(d: DocumentData): VariationOption {
  return {
    id: optionId(String(d['id'])),
    name: String(d['name']),
    position: Number(d['position']),
    values: ((d['values'] ?? []) as DocumentData[]).map((value) => ({
      id: valueId(String(value['id'])),
      label: String(value['label']),
      position: Number(value['position']),
    })),
  };
}

function combinationFromDoc(value: unknown): Combination {
  const entries = Object.entries((value ?? {}) as Record<string, unknown>);
  return Object.fromEntries(entries.map(([option, chosen]) => [optionId(option), valueId(String(chosen))]));
}

function imagesFromDoc(value: unknown): ImageRef[] {
  return ((value ?? []) as DocumentData[]).map((image) => ({
    storagePath: String(image['storagePath']),
    alt: String(image['alt']),
    position: Number(image['position']),
  }));
}

const imageToDoc = (image: ImageRef) => ({ storagePath: image.storagePath, alt: image.alt, position: image.position });

function skuFromDoc(value: unknown): Sku | null {
  if (value == null) return null;
  const { raw, normalized } = value as { raw: string; normalized: string };
  return { raw: String(raw), normalized: String(normalized) };
}

export function moneyFromDoc(value: unknown): Money | null {
  if (value == null) return null;
  const { amount, currency } = value as { amount: number; currency: string };
  return money(amount, currency);
}

/** `private/costs`: un mapa de variante a importe. Sin documento, ninguna variante tiene costo. */
export function variantCostsFromDoc(d: DocumentData | undefined): ReadonlyMap<VariantId, Money> {
  const costs = (d?.['costs'] ?? {}) as Record<string, unknown>;
  const entries = Object.entries(costs).flatMap(([id, value]) => {
    const amount = moneyFromDoc(value);
    return amount ? [[variantId(id), amount] as const] : [];
  });
  return new Map(entries);
}

const moneyToDoc = (value: Money | null) => value && { amount: value.amount, currency: value.currency };

export function stockFromDoc(value: unknown): StockLevel {
  const stock = value as { kind?: string; value?: number } | undefined;
  return stock?.kind === 'quantity' ? stockQuantity(Number(stock.value)) : stockUndefined();
}

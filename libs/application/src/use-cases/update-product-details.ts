import {
  adjustVocabulary,
  AGE_GROUPS,
  GENDERS,
  MAX_MPN_LENGTH,
  canonicalTerm,
  MAX_BRAND_LENGTH,
  MAX_SEO_DESCRIPTION,
  MAX_SEO_TITLE,
  normalizeTags,
  parseVideoUrl,
  TagLimitError,
  type AgeGroup,
  type ExternalVideo,
  type Gender,
  type ImageRef,
  type Product,
  type ProductId,
  type Term,
  type Vocabulary,
} from '@ecommerce/domain';
import { BusinessRuleError } from '../errors';
import { requirePermission } from '../ports/authorization';
import type { OperationContext } from '../ports/operation-context';
import type { TransactionScope } from '../ports/unit-of-work';
import { assertVersion, bumped, loadProduct, productName, validImages, type UseCaseDependencies } from './shared';
import { freeSlug, moveSlug, optionalText, slugBaseFor } from './storefront/shared';

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

const SUPPORTED_VIDEO = ['YouTube', 'Vimeo'];

export class UpdateProductDetails {
  static readonly requires = requirePermission('catalog.write');

  constructor(private readonly deps: UseCaseDependencies) {}

  async execute(tx: TransactionScope, ctx: OperationContext, input: UpdateProductDetailsInput): Promise<{ version: number }> {
    // Todas las lecturas antes que cualquier escritura: el producto, el vocabulario y las URL candidatas.
    const product = await loadProduct(tx, input.productId);
    assertVersion(product, input.version);

    const renamed = input.name === undefined ? null : productName(input.name);
    const vocabulary = input.tags !== undefined || input.brand !== undefined ? await tx.vocabulary.get() : null;
    const slugChange = await this.slugFollowingName(tx, product, renamed?.name);

    const terms = vocabulary ? this.terms(product, vocabulary, input) : null;
    const updated = bumped({
      ...product,
      ...(renamed ?? {}),
      description: input.description?.trim() ?? product.description,
      images: input.images === undefined ? product.images : validImages(input.images, ctx.tenantId, product.id),
      ...(input.seoTitle === undefined ? {} : { seoTitle: optionalText(input.seoTitle, MAX_SEO_TITLE, 'El título para buscadores') }),
      ...(input.seoDescription === undefined
        ? {}
        : { seoDescription: optionalText(input.seoDescription, MAX_SEO_DESCRIPTION, 'La descripción para buscadores') }),
      ...(input.video === undefined ? {} : { video: video(input.video) }),
      ...(input.mpn === undefined ? {} : { mpn: optionalText(input.mpn, MAX_MPN_LENGTH, 'El MPN') }),
      ...(input.ageGroup === undefined ? {} : { ageGroup: closed(input.ageGroup, AGE_GROUPS, 'El rango de edad') }),
      ...(input.gender === undefined ? {} : { gender: closed(input.gender, GENDERS, 'El género') }),
      ...(terms?.fields ?? {}),
      ...(slugChange ? { slug: slugChange.slug, slugNeedsReplacement: slugChange.needsReplacement } : {}),
      updatedAt: this.deps.clock.now(),
    });

    if (slugChange) await moveSlug(tx, product, slugChange.slug, false, product.id);
    if (terms && vocabulary) await tx.vocabulary.save(terms.vocabulary);
    await tx.products.save(updated);
    return { version: updated.version };
  }

  /**
   * Mientras nadie pudo enlazarla —nunca publicado y sin editar a mano—, la URL sigue al nombre
   * (FR-008). Solo lee: elige la URL nueva y la escritura va después.
   */
  private async slugFollowingName(tx: TransactionScope, product: Product, newName: string | undefined) {
    if (newName === undefined || newName === product.name || product.slugLocked) return null;
    const { base, needsReplacement } = slugBaseFor(newName, product.id);
    const slug = await freeSlug(tx, base, product.id, this.deps.ids);
    return slug === product.slug ? null : { slug, needsReplacement };
  }

  /**
   * Etiquetas y marca con la forma ya registrada en el comercio, y el vocabulario ajustado a lo que
   * cambió (FR-011, FR-012).
   */
  private terms(product: Product, vocabulary: Vocabulary, input: UpdateProductDetailsInput) {
    let next = vocabulary;
    const fields: Partial<Product> = {};

    if (input.tags !== undefined) {
      const tags = tagsOrInvalid(input.tags).map((tag) => canonicalTerm(next.tags, tag));
      next = adjustVocabulary(next, 'tags', termsOf(product.tags, product.tagsNormalized), tags);
      Object.assign(fields, { tags: tags.map((t) => t.label), tagsNormalized: tags.map((t) => t.normalized) });
    }
    if (input.brand !== undefined) {
      const written = optionalText(input.brand, MAX_BRAND_LENGTH, 'La marca');
      const brand = written === null ? null : canonicalTerm(next.brands, written);
      const before = product.brand && product.brandNormalized ? [{ label: product.brand, normalized: product.brandNormalized }] : [];
      next = adjustVocabulary(next, 'brands', before, brand ? [brand] : []);
      Object.assign(fields, { brand: brand?.label ?? null, brandNormalized: brand?.normalized ?? null });
    }
    return { fields, vocabulary: next };
  }
}

function tagsOrInvalid(raw: readonly string[]): string[] {
  try {
    return normalizeTags(raw).tags;
  } catch (error) {
    if (error instanceof TagLimitError) throw new BusinessRuleError('invalid-argument', error.message);
    throw error;
  }
}

const termsOf = (labels: readonly string[], normalized: readonly string[]): Term[] =>
  labels.map((label, i) => ({ label, normalized: normalized[i] ?? '' }));

/** Solo YouTube o Vimeo (FR-018); se guarda el id del video, no el enlace. */
function video(input: { readonly url: string; readonly position: number } | null): ExternalVideo | null {
  if (input === null) return null;
  const parsed = parseVideoUrl(input.url);
  if (!parsed) {
    throw new BusinessRuleError('unsupported-video', 'Solo se admiten videos de YouTube o Vimeo', { supported: SUPPORTED_VIDEO });
  }
  if (!Number.isInteger(input.position) || input.position < 0) {
    throw new BusinessRuleError('invalid-argument', 'La posición del video no es válida', { position: input.position });
  }
  return { ...parsed, position: input.position };
}

/** Un valor de una lista cerrada (FR-031), o `null`. El parseo ya lo filtra; esto lo garantiza. */
function closed<T extends string>(value: T | null, allowed: readonly T[], field: string): T | null {
  if (value !== null && !allowed.includes(value)) {
    throw new BusinessRuleError('invalid-argument', `${field} no es uno de los valores admitidos`, { field, allowed });
  }
  return value;
}

import { Component, computed, inject, input, linkedSignal, resource, signal } from '@angular/core';
import { form, FormField, readonly, submit, validate } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatChip, MatChipRemove, MatChipSet } from '@angular/material/chips';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  canonicalTerm,
  emptyVocabulary,
  MAX_BRAND_LENGTH,
  MAX_SEO_DESCRIPTION,
  MAX_SEO_TITLE,
  MAX_TAG_LENGTH,
  MAX_TAGS,
  normalizeName,
  slugify,
  suggestTerms,
  type Product,
  type TenantId,
  type Vocabulary,
} from '@ecommerce/domain';
import { CATALOG_COMMANDS, CATALOG_QUERIES } from '../../../core/client';
import { commandErrorMessage } from '../../../shared/command-errors';
import { keepUnsaved } from '../../../shared/keep-unsaved';
import { liveResource } from '../../../shared/live-resource';
import { trackUnsaved } from '../../../shared/pending-changes/pending-changes';
import { injectCan } from '../../../tenant/current-access';

interface Sheet {
  seoTitle: string;
  seoDescription: string;
  tags: readonly string[];
  brand: string;
}

const sheetOf = (product: Product): Sheet => ({
  seoTitle: product.seoTitle ?? '',
  seoDescription: product.seoDescription ?? '',
  tags: product.tags,
  brand: product.brand ?? '',
});

/** Qué dice la URL que se está escribiendo, antes de guardarla (FR-007). */
type SlugStatus = { readonly text: string; readonly canSave: boolean };

/**
 * La ficha de tienda de un producto (Historia 1 de la 002): su URL amigable, cómo aparece en un
 * buscador, sus etiquetas y su marca. La URL se guarda aparte porque se valida contra el resto del
 * comercio; lo demás, junto. Sin `catalog.write` todo se lee y nada se edita (FR-002).
 */
@Component({
  selector: 'app-storefront-section',
  imports: [FormField, MatFormField, MatLabel, MatHint, MatError, MatInput, MatButton, MatChipSet, MatChip, MatChipRemove],
  templateUrl: './storefront-section.html',
  styleUrl: './storefront-section.scss',
})
export class StorefrontSection {
  readonly tenantId = input.required<TenantId>();
  readonly product = input.required<Product>();

  protected readonly maxSeoTitle = MAX_SEO_TITLE;
  protected readonly maxSeoDescription = MAX_SEO_DESCRIPTION;

  private readonly commands = inject(CATALOG_COMMANDS);
  private readonly queries = inject(CATALOG_QUERIES);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly canWrite = injectCan('catalog.write');

  private readonly vocabulary = liveResource<Vocabulary, TenantId>({
    params: () => this.tenantId(),
    subscribe: (tenantId, watcher) => this.queries.watchVocabulary(tenantId, watcher),
  });
  private readonly terms = computed(() => (this.vocabulary.hasValue() ? (this.vocabulary.value() ?? emptyVocabulary()) : emptyVocabulary()));

  // ── URL amigable ──────────────────────────────────────────────────────────────────────────────

  private readonly storedSlug = computed(() => ({ slug: this.product().slug ?? '' }));
  protected readonly slugDraft = linkedSignal<{ slug: string }, { slug: string }>({ source: this.storedSlug, computation: keepUnsaved });
  protected readonly slugForm = form(this.slugDraft, (path) => {
    readonly(path, { when: () => !this.canWrite() });
  });
  private readonly slugChanged = computed(() => this.slugDraft().slug !== this.storedSlug().slug);
  /** Cómo va a quedar: la misma normalización que aplica el servidor. */
  protected readonly normalizedSlug = computed(() => slugify(this.slugDraft().slug));
  private readonly reservation = resource({
    params: () => {
      const slug = this.normalizedSlug();
      return this.slugChanged() && slug && slug !== this.product().slug ? { tenantId: this.tenantId(), slug } : undefined;
    },
    loader: ({ params }) => this.queries.findSlug(params.tenantId, params.slug),
  });
  protected readonly slugStatus = computed<SlugStatus | null>(() => {
    if (!this.slugChanged()) return null;
    const slug = this.normalizedSlug();
    if (!slug) return { text: 'La URL necesita al menos una letra o un número.', canSave: false };
    if (slug === this.product().slug) return { text: 'Es la URL vigente.', canSave: false };
    if (this.reservation.isLoading() || !this.reservation.hasValue()) return { text: 'Comprobando…', canSave: false };
    const entry = this.reservation.value();
    if (!entry) return { text: 'Disponible.', canSave: true };
    if (entry.productId === this.product().id) return { text: 'Era una URL anterior de este producto: se recupera.', canSave: true };
    return { text: 'La usa otro producto.', canSave: false };
  });
  protected readonly slugFailure = signal('');

  // ── Buscadores, etiquetas y marca ──────────────────────────────────────────────────────────────

  private readonly storedSheet = computed(() => sheetOf(this.product()));
  protected readonly sheet = linkedSignal<Sheet, Sheet>({ source: this.storedSheet, computation: keepUnsaved });
  protected readonly sheetForm = form(this.sheet, (path) => {
    readonly(path, { when: () => !this.canWrite() });
    validate(path.seoTitle, ({ value }) => tooLong(value(), MAX_SEO_TITLE));
    validate(path.seoDescription, ({ value }) => tooLong(value(), MAX_SEO_DESCRIPTION));
    validate(path.brand, ({ value }) => tooLong(value(), MAX_BRAND_LENGTH));
  });
  protected readonly sheetFailure = signal('');

  /** Lo que se está escribiendo en el campo de etiqueta: todavía no es una etiqueta. */
  protected readonly tagInput = signal('');
  protected readonly tagSuggestions = computed(() => {
    const added = new Set(this.sheet().tags.map(normalizeName));
    return suggestTerms(this.terms().tags, this.tagInput(), 8)
      .filter((label) => !added.has(normalizeName(label)))
      .slice(0, 5);
  });
  protected readonly brandSuggestions = computed(() => {
    const written = this.sheet().brand;
    return suggestTerms(this.terms().brands, written, 5).filter((label) => label !== written.trim());
  });
  protected readonly tagFailure = signal('');

  /** Lo que verá un buscador: lo escrito, o el nombre y el comienzo de la descripción (FR-009, FR-010). */
  protected readonly preview = computed(() => {
    const { seoTitle, seoDescription } = this.sheet();
    const product = this.product();
    return {
      title: seoTitle.trim() || product.name,
      description: seoDescription.trim() || product.description.slice(0, MAX_SEO_DESCRIPTION),
      url: `…/${product.slug ?? ''}`,
      usesDefaults: seoTitle.trim() === '' || seoDescription.trim() === '',
    };
  });

  protected readonly dirty = computed(() => {
    const [draft, stored] = [this.sheet(), this.storedSheet()];
    return (
      this.slugChanged() ||
      draft.seoTitle !== stored.seoTitle ||
      draft.seoDescription !== stored.seoDescription ||
      draft.brand !== stored.brand ||
      draft.tags !== stored.tags
    );
  });

  constructor() {
    trackUnsaved(() => this.dirty());
  }

  protected setTagInput(value: string): void {
    this.tagInput.set(value);
    this.tagFailure.set('');
  }

  /** Agrega una etiqueta con la forma ya registrada en el comercio; no repite (FR-011). */
  protected addTag(written: string): void {
    const label = written.trim();
    if (label === '') return;
    if (label.length > MAX_TAG_LENGTH) {
      this.tagFailure.set(`Una etiqueta admite hasta ${MAX_TAG_LENGTH} caracteres.`);
      return;
    }
    const term = canonicalTerm(this.terms().tags, label);
    const tags = this.sheet().tags;
    if (!tags.some((tag) => normalizeName(tag) === term.normalized)) {
      if (tags.length >= MAX_TAGS) {
        this.tagFailure.set(`Un producto admite hasta ${MAX_TAGS} etiquetas.`);
        return;
      }
      this.sheet.update((sheet) => ({ ...sheet, tags: [...sheet.tags, term.label] }));
    }
    this.tagInput.set('');
  }

  protected removeTag(tag: string): void {
    this.sheet.update((sheet) => ({ ...sheet, tags: sheet.tags.filter((t) => t !== tag) }));
  }

  protected chooseBrand(label: string): void {
    this.sheet.update((sheet) => ({ ...sheet, brand: label }));
  }

  protected discard(): void {
    this.slugDraft.set(this.storedSlug());
    this.sheet.set(this.storedSheet());
    this.tagInput.set('');
    this.slugFailure.set('');
    this.sheetFailure.set('');
  }

  protected async saveSlug(): Promise<void> {
    if (!this.slugStatus()?.canSave) return;
    this.slugFailure.set('');
    const product = this.product();
    const result = await this.commands.setProductSlug(this.tenantId(), { productId: product.id, version: product.version, slug: this.slugDraft().slug });
    if (result.ok) {
      this.snackBar.open(`URL guardada: …/${result.data.slug}`, undefined, { duration: 3000 });
    } else {
      this.slugFailure.set(result.code === 'version-conflict' ? CONFLICT : commandErrorMessage(result.code));
    }
  }

  protected saveSheet(): void {
    this.sheetFailure.set('');
    void submit(this.sheetForm, async () => {
      const { seoTitle, seoDescription, tags, brand } = this.sheet();
      const product = this.product();
      const result = await this.commands.updateProductDetails(this.tenantId(), {
        productId: product.id,
        version: product.version,
        seoTitle,
        seoDescription,
        tags: [...tags],
        brand,
      });
      if (result.ok) this.snackBar.open('Ficha de tienda guardada', undefined, { duration: 3000 });
      else this.sheetFailure.set(result.code === 'version-conflict' ? CONFLICT : commandErrorMessage(result.code));
      return undefined;
    });
  }
}

const CONFLICT = 'Alguien más editó el producto mientras lo tenías abierto. Descartá tus cambios para ver los actuales.';

function tooLong(value: string, max: number) {
  return value.trim().length > max ? { kind: 'maxLength', message: `Admite hasta ${max} caracteres.` } : undefined;
}

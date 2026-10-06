import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Component, computed, inject, Injector, input, linkedSignal, output, signal } from '@angular/core';
import { form, FormField, readonly, validate } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import type { CommandErrorCode, CommandFailure, CommandResult } from '@ecommerce/application';
import {
  gtin,
  InvalidGtinError,
  isVariantComplete,
  type CurrencyCode,
  type Money,
  type Product,
  type ProductId,
  type TenantId,
  type Variant,
  type VariantId,
} from '@ecommerce/domain';
import { CATALOG_COMMANDS } from '../../core/client';
import { commandErrorMessage } from '../../shared/command-errors';
import { keepUnsaved } from '../../shared/keep-unsaved';
import { trackUnsaved } from '../../shared/pending-changes/pending-changes';
import { injectCan } from '../../tenant/current-access';
import { formatMoneyInput, formatStockInput, parseMoneyInput, parseStockInput } from '../shared/amount-input';
import { amount, parseDimensions, show, showDimensions } from '../shared/shipping-units';
import { VariantImagesDialog, type VariantImagesData } from './variant-images-dialog';

type Field = 'sku' | 'price' | 'compareAtPrice' | 'stock' | 'cost' | 'gtin' | 'weight' | 'dimensions';
type Fields = Record<Field, string>;

/** Un rechazo del servidor para un valor. Si no es culpa del valor, se puede reenviar tal cual. */
interface Rejection {
  readonly value: string;
  readonly message: string;
  readonly retryable: boolean;
}

/**
 * Fallas que no dicen nada del valor: sin conexión, del servidor, o que otra persona lo cambió
 * antes. El mismo valor se puede volver a enviar (FR-039); un SKU ocupado o un dato inválido, no.
 */
const RETRYABLE: ReadonlySet<CommandErrorCode> = new Set<CommandErrorCode>(['unavailable', 'internal', 'audit-write-failed', 'version-conflict']);

const FIELD_NAMES: Record<Field, string> = {
  sku: 'SKU',
  price: 'Precio',
  compareAtPrice: 'Precio tachado',
  stock: 'Existencias',
  cost: 'Costo',
  gtin: 'GTIN',
  weight: 'Peso',
  dimensions: 'Dimensiones',
};

const GTIN_PROBLEMS: Record<InvalidGtinError['reason'], string> = {
  length: 'Un GTIN tiene 8, 12, 13 o 14 dígitos.',
  digits: 'Un GTIN lleva solo dígitos.',
  'check-digit': 'El dígito de control no corresponde: revisá el código.',
};

/** El GTIN escrito, validado con la misma factoría del servidor; vacío, sin problema (lo quita). */
function gtinProblem(text: string): string | null {
  if (text.trim() === '') return null;
  try {
    gtin(text);
    return null;
  } catch (error) {
    if (error instanceof InvalidGtinError) return GTIN_PROBLEMS[error.reason];
    throw error;
  }
}

/** Lo que la fila necesita del producto para mostrar el envío heredado (FR-015). */
export type ShippingSource = Pick<Product, 'kind' | 'weightGrams' | 'dimensionsMm' | 'options'>;

function canonicalText(field: Field, text: string, currency: CurrencyCode): string {
  switch (field) {
    case 'sku':
      return text.trim();
    case 'price':
    case 'compareAtPrice':
    case 'cost': {
      const parsed = parseMoneyInput(text, currency);
      return parsed.ok ? formatMoneyInput(parsed.value) : text;
    }
    case 'stock': {
      const parsed = parseStockInput(text);
      return parsed.ok ? formatStockInput(parsed.value) : text;
    }
    case 'gtin':
      return text.trim();
    case 'weight': {
      const grams = amount(text, 1000);
      return grams === 'invalid' ? text : show(grams, 1000);
    }
    case 'dimensions': {
      const mm = parseDimensions(text);
      return mm === 'invalid' ? text : showDimensions(mm);
    }
  }
}

function fieldsOf(variant: Variant, cost: Money | null | undefined): Fields {
  return {
    sku: variant.sku?.raw ?? '',
    price: formatMoneyInput(variant.price),
    compareAtPrice: formatMoneyInput(variant.compareAtPrice),
    stock: formatStockInput(variant.stock),
    cost: formatMoneyInput(cost ?? null),
    gtin: variant.gtin?.raw ?? '',
    weight: show(variant.weightGrams, 1000),
    dimensions: showDimensions(variant.dimensionsMm),
  };
}

/**
 * Una variante, editable en línea (T056). Cada campo se guarda solo, al salir de él o con Enter,
 * con su propia orden: el SKU, los importes y las existencias tienen permisos distintos y los
 * importes y las existencias dejan su entrada en la bitácora. Cada campo se edita solo con su
 * permiso y el costo ni se muestra sin `variant.cost.read` (T078, T079); el resto se lee igual.
 */
@Component({
  selector: 'app-variant-row',
  imports: [FormField, MatCheckbox, MatButton, MatFormField, MatLabel, MatError, MatHint, MatInput],
  templateUrl: './variant-row.html',
  styleUrl: './variant-row.scss',
})
export class VariantRow {
  readonly tenantId = input.required<TenantId>();
  readonly productId = input.required<ProductId>();
  readonly variant = input.required<Variant>();
  readonly label = input.required<string>();
  readonly currency = input.required<CurrencyCode>();
  /** Para nombrar la variante que ocupa un SKU. */
  readonly labelOf = input.required<(id: VariantId) => string | undefined>();
  /**
   * El costo de adquisición, que vive aparte (FR-015): `undefined` mientras carga, `null` si no
   * tiene. La tabla solo lo pide con `variant.cost.read`.
   */
  readonly cost = input<Money | null | undefined>(undefined);
  /** Para la edición masiva (T058); sin permiso para ninguno de sus campos no se ofrece. */
  readonly selectable = input(true);
  readonly selected = input(false);
  readonly selectedChange = output<boolean>();
  /**
   * El producto, para el envío que hereda cada variante (FR-015, Historia 4 de la 002). Sin él, o en
   * un digital, la fila no ofrece peso ni dimensiones.
   */
  readonly shipping = input<ShippingSource | null>(null);

  private readonly commands = inject(CATALOG_COMMANDS);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);

  private readonly canWriteCatalog = injectCan('catalog.write');
  private readonly canWritePrice = injectCan('variant.price.write');
  private readonly canWriteStock = injectCan('variant.stock.write');
  private readonly canWriteCost = injectCan('variant.cost.write');
  protected readonly canReadCost = injectCan('variant.cost.read');

  protected readonly incomplete = computed(() => !isVariantComplete(this.variant()));
  /**
   * Peso y dimensiones por variante, solo en un físico con opciones (FR-015): sin opciones, la única
   * variante es el producto, y su peso "propio" no haría más que repetir el del producto.
   */
  protected readonly physical = computed(() => this.shipping()?.kind === 'physical' && (this.shipping()?.options.length ?? 0) > 0);
  /**
   * El código de barras y el envío van plegados, después de los campos de siempre: el orden con Tab
   * de la fila no cambia para quien no los abre (FR-038a de la 001), y la fila cabe a 360 px.
   */
  protected readonly expanded = signal(false);
  protected readonly detailsId = computed(() => `mas-datos-${this.variant().id}`);
  protected readonly moreLabel = computed(() => (this.physical() ? 'Código de barras y envío' : 'Código de barras'));
  /** Lo guardado, a la vista aunque esté plegado; lo heredado, señalado como tal (FR-015). */
  protected readonly summary = computed(() => {
    const variant = this.variant();
    const product = this.shipping();
    const parts = [variant.gtin ? `GTIN ${variant.gtin.raw}` : 'Sin GTIN'];
    if (this.physical() && product) {
      if (variant.weightGrams !== null) parts.push(`Peso ${show(variant.weightGrams, 1000)} kg`);
      else parts.push(product.weightGrams !== null ? `Peso ${show(product.weightGrams, 1000)} kg, heredado del producto` : 'Sin peso');
      if (variant.dimensionsMm !== null) parts.push(`${showDimensions(variant.dimensionsMm)} cm`);
      else parts.push(product.dimensionsMm !== null ? `${showDimensions(product.dimensionsMm)} cm, heredadas del producto` : 'Sin dimensiones');
    }
    return parts.join(' · ');
  });
  protected readonly inheritedWeight = computed(() => show(this.shipping()?.weightGrams, 1000));
  protected readonly inheritedDimensions = computed(() => showDimensions(this.shipping()?.dimensionsMm));
  protected readonly headingId = computed(() => `variante-${this.variant().id}`);

  private readonly stored = computed(() => fieldsOf(this.variant(), this.cost()));
  /** Lo escrito y todavía sin guardar se conserva; el resto sigue a lo que llega del servidor. */
  protected readonly draft = linkedSignal<Fields, Fields>({
    source: this.stored,
    computation: keepUnsaved,
  });

  /** Lo que el servidor ya aceptó, en su forma canónica, mientras su versión no llega en tiempo real. */
  private readonly saved = signal<Partial<Fields>>({});
  /**
   * Algún campo tiene algo escrito que no está guardado: sin enviar, en camino o rechazado (FR-039).
   * Lo aceptado no cuenta aunque todavía no haya llegado de vuelta.
   */
  private readonly unsaved = computed(() => {
    const [draft, stored, saved] = [this.draft(), this.stored(), this.saved()];
    return (Object.keys(draft) as Field[]).some((field) => draft[field] !== stored[field] && draft[field] !== saved[field]);
  });

  /** El rechazo del servidor vale para el valor que lo provocó: al cambiarlo, desaparece. */
  private readonly rejections = signal<Partial<Record<Field, Rejection>>>({});
  /**
   * La variante archivada que tiene el GTIN rechazado: se le puede quitar desde acá, que es la
   * única forma de liberar el código (FR-030). Solo mientras el GTIN escrito sea el rechazado.
   */
  private readonly archivedHolder = signal<{ productId: ProductId; variantId: VariantId; version: number; gtin: string } | null>(null);
  protected readonly canReleaseHolder = computed(() => {
    const holder = this.archivedHolder();
    return holder !== null && holder.gtin === this.draft().gtin && this.canWriteCatalog();
  });

  protected readonly rowForm = form(this.draft, (path) => {
    readonly(path.sku, { when: () => !this.canWriteCatalog() });
    readonly(path.price, { when: () => !this.canWritePrice() });
    readonly(path.compareAtPrice, { when: () => !this.canWritePrice() });
    readonly(path.stock, { when: () => !this.canWriteStock() });
    readonly(path.cost, { when: () => !this.canWriteCost() || this.cost() === undefined });
    readonly(path.gtin, { when: () => !this.canWriteCatalog() });
    readonly(path.weight, { when: () => !this.canWriteCatalog() });
    readonly(path.dimensions, { when: () => !this.canWriteCatalog() });
    validate(path.gtin, ({ value }) => {
      const problem = gtinProblem(value());
      return problem ? { kind: 'format', message: problem } : this.rejection('gtin', value());
    });
    validate(path.weight, ({ value }) =>
      amount(value(), 1000) === 'invalid' ? { kind: 'format', message: 'El peso tiene que ser un número mayor que cero.' } : this.rejection('weight', value()),
    );
    validate(path.dimensions, ({ value }) =>
      parseDimensions(value()) === 'invalid'
        ? { kind: 'format', message: 'Escribí largo × ancho × alto en centímetros, por ejemplo 30 × 20 × 2.' }
        : this.rejection('dimensions', value()),
    );
    validate(path.sku, ({ value }) =>
      value().trim() === '' && this.stored().sku !== '' ? { kind: 'required', message: 'El SKU no se puede quitar' } : this.rejection('sku', value()),
    );
    validate(path.price, ({ value }) => {
      const parsed = parseMoneyInput(value(), this.currency());
      if (!parsed.ok) return { kind: 'format', message: parsed.message };
      if (parsed.value === null && this.stored().price !== '') return { kind: 'required', message: 'El precio no se puede quitar' };
      return this.rejection('price', value());
    });
    validate(path.compareAtPrice, ({ value }) => {
      const parsed = parseMoneyInput(value(), this.currency());
      return parsed.ok ? this.rejection('compareAtPrice', value()) : { kind: 'format', message: parsed.message };
    });
    validate(path.stock, ({ value }) => {
      const parsed = parseStockInput(value());
      return parsed.ok ? this.rejection('stock', value()) : { kind: 'format', message: parsed.message };
    });
    validate(path.cost, ({ value }) => {
      const parsed = parseMoneyInput(value(), this.currency());
      if (!parsed.ok) return { kind: 'format', message: parsed.message };
      if (parsed.value === null && this.stored().cost !== '') return { kind: 'required', message: 'El costo no se puede quitar' };
      return this.rejection('cost', value());
    });
  });

  /** La versión que dejó la última orden de esta fila, hasta que el servidor confirme una mayor. */
  private readonly knownVersion = linkedSignal(() => this.variant().version);
  /** Lo último enviado por campo: salir del campo justo después de Enter no lo manda dos veces. */
  private readonly sent: Partial<Fields> = {};
  /** Las órdenes de una fila van en fila: cada una usa la versión que dejó la anterior. */
  private queue: Promise<void> = Promise.resolve();

  constructor() {
    trackUnsaved(() => this.unsaved());
  }

  protected openImages(): void {
    const data: VariantImagesData = { tenantId: this.tenantId(), productId: this.productId(), label: this.label(), variant: this.variant };
    // Con el inyector de la fila, el diálogo ve el acceso del comercio (CURRENT_ACCESS) que da su marco.
    this.dialog.open(VariantImagesDialog, { data, width: 'min(560px, 100vw - 32px)', injector: this.injector });
  }

  protected commit(field: Field): void {
    this.queue = this.queue.then(() => this.save(field));
  }

  private async save(field: Field): Promise<void> {
    const text = this.draft()[field];
    if (text === this.stored()[field] || text === this.sent[field]) return;
    const state = this.fieldState(field);
    const rejected = this.rejections()[field];
    const retrying = rejected?.retryable === true && rejected.value === text;
    if (state.invalid() && !retrying) {
      // Con Enter el campo no pierde el foco: sin esto, el error no se vería ni se anunciaría.
      state.markAsTouched();
      const problem = state.errors()[0]?.message;
      if (problem) void this.announcer.announce(`${FIELD_NAMES[field]} de ${this.label()}: ${problem}`, 'assertive');
      return;
    }

    this.sent[field] = text;
    const result = await this.send(field, text);
    if (result.ok) {
      this.clearRejection(field);
      // El costo vive en otro documento: no cambia la versión de la variante.
      if (field !== 'cost') this.knownVersion.set(result.version ?? this.knownVersion() + 1);
      this.markSaved(field, text);
      void this.announcer.announce(`${FIELD_NAMES[field]} de ${this.label()} guardado`);
    } else {
      delete this.sent[field];
      const message = this.failureMessage(field, result.failure);
      if (field === 'gtin') this.archivedHolder.set(archivedHolderOf(result.failure, text));
      this.rejections.update((current) => ({ ...current, [field]: { value: text, message, retryable: RETRYABLE.has(result.failure.code) } }));
      // Visible también si se guardó con Enter, sin salir del campo.
      this.fieldState(field).markAsTouched();
      void this.announcer.announce(`${FIELD_NAMES[field]} de ${this.label()}: ${message}`, 'assertive');
    }
  }

  /**
   * Lo guardado deja de ser "escrito sin guardar": el campo toma la forma en que lo guarda el
   * servidor ("10" pasa a "10,00"), así coincide con lo que llega y vuelve a seguir sus cambios.
   * Si la persona ya volvió a escribir en el campo, se respeta lo nuevo.
   */
  private markSaved(field: Field, text: string): void {
    const canonical = canonicalText(field, text, this.currency());
    this.saved.update((saved) => ({ ...saved, [field]: canonical }));
    this.draft.update((draft) => (draft[field] === text ? { ...draft, [field]: canonical } : draft));
  }

  private async send(field: Field, text: string): Promise<{ ok: true; version?: number } | { ok: false; failure: CommandFailure }> {
    const ids = { productId: this.productId(), variantId: this.variant().id, version: this.knownVersion() };
    const settled = <T>(result: CommandResult<T>, version?: (data: T) => number) =>
      result.ok ? { ok: true as const, ...(version ? { version: version(result.data) } : {}) } : { ok: false as const, failure: result };

    switch (field) {
      case 'sku':
        return settled(await this.commands.setVariantSku(this.tenantId(), { ...ids, sku: text.trim() }), (data) => data.version);
      case 'price':
      case 'compareAtPrice': {
        const parsed = parseMoneyInput(text, this.currency());
        if (!parsed.ok) throw new Error('Importe inválido después de validar');
        const { productId, ...change } = ids;
        return settled(await this.commands.setVariantPrice(this.tenantId(), { productId, changes: [{ ...change, [field]: parsed.value }] }));
      }
      case 'stock': {
        const parsed = parseStockInput(text);
        if (!parsed.ok) throw new Error('Existencias inválidas después de validar');
        const { productId, ...change } = ids;
        return settled(await this.commands.setVariantStock(this.tenantId(), { productId, changes: [{ ...change, stock: parsed.value }] }));
      }
      case 'cost': {
        const parsed = parseMoneyInput(text, this.currency());
        if (!parsed.ok || parsed.value === null) throw new Error('Costo inválido después de validar');
        const changes = [{ variantId: this.variant().id, cost: parsed.value }];
        return settled(await this.commands.setVariantCost(this.tenantId(), { productId: this.productId(), changes }));
      }
      case 'gtin':
        return settled(await this.commands.setVariantGtin(this.tenantId(), { ...ids, gtin: text.trim() === '' ? null : text.trim() }), (data) => data.version);
      case 'weight':
      case 'dimensions': {
        const { productId, ...change } = ids;
        const value = field === 'weight' ? amount(text, 1000) : parseDimensions(text);
        if (value === 'invalid') throw new Error('Envío inválido después de validar');
        const changes = [{ ...change, [field === 'weight' ? 'weightGrams' : 'dimensionsMm']: value }];
        return settled(await this.commands.setVariantShipping(this.tenantId(), { productId, changes }), (data) => data.versions[change.variantId] ?? change.version + 1);
      }
    }
  }

  private failureMessage(field: Field, failure: CommandFailure): string {
    if (failure.code === 'sku-conflict') {
      const { occupiedBy, productId } = (failure.details ?? {}) as { occupiedBy?: VariantId; productId?: ProductId };
      if (productId !== this.productId()) return 'Ese SKU ya lo usa una variante de otro producto';
      const other = occupiedBy && this.labelOf()(occupiedBy);
      return other ? `Ese SKU ya lo usa la variante ${other}` : 'Ese SKU ya lo usa una variante archivada de este producto';
    }
    if (failure.code === 'gtin-conflict') {
      const { productName, archived } = (failure.details ?? {}) as { productName?: string | null; archived?: boolean };
      return `Ese GTIN ya lo usa ${productName ? `«${productName}»` : 'otra variante'}${archived ? ', archivado' : ''}.`;
    }
    if (failure.code === 'version-conflict') {
      const current = this.stored()[field] || 'sin definir';
      return `Cambió mientras la editabas: ahora es «${current}». Si querés tu valor, volvé a guardarlo.`;
    }
    return commandErrorMessage(failure.code);
  }

  /** Le quita el GTIN a la variante archivada que lo tiene y lo vuelve a pedir para esta (FR-030). */
  protected async releaseHolder(): Promise<void> {
    const holder = this.archivedHolder();
    if (!holder) return;
    const released = await this.commands.setVariantGtin(this.tenantId(), { productId: holder.productId, variantId: holder.variantId, version: holder.version, gtin: null });
    if (!released.ok) {
      this.rejections.update((current) => ({ ...current, gtin: { value: holder.gtin, message: commandErrorMessage(released.code), retryable: true } }));
      return;
    }
    this.archivedHolder.set(null);
    this.clearRejection('gtin');
    this.commit('gtin');
  }

  private clearRejection(field: Field): void {
    this.rejections.update((current) => {
      const rest = { ...current };
      delete rest[field];
      return rest;
    });
  }

  private rejection(field: Field, value: string) {
    const rejected = this.rejections()[field];
    return rejected && rejected.value === value ? { kind: 'server', message: rejected.message } : undefined;
  }

  private fieldState(field: Field) {
    switch (field) {
      case 'sku':
        return this.rowForm.sku();
      case 'price':
        return this.rowForm.price();
      case 'compareAtPrice':
        return this.rowForm.compareAtPrice();
      case 'stock':
        return this.rowForm.stock();
      case 'cost':
        return this.rowForm.cost();
      case 'gtin':
        return this.rowForm.gtin();
      case 'weight':
        return this.rowForm.weight();
      case 'dimensions':
        return this.rowForm.dimensions();
    }
  }
}

/** Si el rechazo es por un GTIN que tiene una variante archivada, quién la tiene y con qué versión. */
function archivedHolderOf(failure: CommandFailure, gtin: string): { productId: ProductId; variantId: VariantId; version: number; gtin: string } | null {
  if (failure.code !== 'gtin-conflict') return null;
  const { productId, variantId, version, archived } = (failure.details ?? {}) as { productId?: ProductId; variantId?: VariantId; version?: number | null; archived?: boolean };
  return archived && productId && variantId && typeof version === 'number' ? { productId, variantId, version, gtin } : null;
}

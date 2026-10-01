import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { form, FormField, validate } from '@angular/forms/signals';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import type { CommandFailure, CommandResult } from '@ecommerce/application';
import { isVariantComplete, type CurrencyCode, type ProductId, type TenantId, type Variant, type VariantId } from '@ecommerce/domain';
import { CATALOG_COMMANDS } from '../../core/client';
import { commandErrorMessage } from '../../shared/command-errors';
import { keepUnsaved } from '../../shared/keep-unsaved';
import { formatMoneyInput, formatStockInput, parseMoneyInput, parseStockInput } from '../shared/amount-input';

type Field = 'sku' | 'price' | 'compareAtPrice' | 'stock';
type Fields = Record<Field, string>;

const FIELD_NAMES: Record<Field, string> = { sku: 'SKU', price: 'Precio', compareAtPrice: 'Precio tachado', stock: 'Existencias' };

function canonicalText(field: Field, text: string, currency: CurrencyCode): string {
  switch (field) {
    case 'sku':
      return text.trim();
    case 'price':
    case 'compareAtPrice': {
      const parsed = parseMoneyInput(text, currency);
      return parsed.ok ? formatMoneyInput(parsed.value) : text;
    }
    case 'stock': {
      const parsed = parseStockInput(text);
      return parsed.ok ? formatStockInput(parsed.value) : text;
    }
  }
}

function fieldsOf(variant: Variant): Fields {
  return {
    sku: variant.sku?.raw ?? '',
    price: formatMoneyInput(variant.price),
    compareAtPrice: formatMoneyInput(variant.compareAtPrice),
    stock: formatStockInput(variant.stock),
  };
}

/**
 * Una variante, editable en línea (T056). Cada campo se guarda solo, al salir de él o con Enter,
 * con su propia orden: el SKU, los importes y las existencias tienen permisos distintos y los
 * importes y las existencias dejan su entrada en la bitácora.
 */
@Component({
  selector: 'app-variant-row',
  imports: [FormField, MatFormField, MatLabel, MatError, MatInput],
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

  private readonly commands = inject(CATALOG_COMMANDS);
  private readonly announcer = inject(LiveAnnouncer);

  protected readonly incomplete = computed(() => !isVariantComplete(this.variant()));
  protected readonly headingId = computed(() => `variante-${this.variant().id}`);

  private readonly stored = computed(() => fieldsOf(this.variant()));
  /** Lo escrito y todavía sin guardar se conserva; el resto sigue a lo que llega del servidor. */
  protected readonly draft = linkedSignal<Fields, Fields>({
    source: this.stored,
    computation: keepUnsaved,
  });

  /** El rechazo del servidor vale para el valor que lo provocó: al cambiarlo, desaparece. */
  private readonly rejections = signal<Partial<Record<Field, { readonly value: string; readonly message: string }>>>({});

  protected readonly rowForm = form(this.draft, (path) => {
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
  });

  /** La versión que dejó la última orden de esta fila, hasta que el servidor confirme una mayor. */
  private readonly knownVersion = linkedSignal(() => this.variant().version);
  /** Lo último enviado por campo: salir del campo justo después de Enter no lo manda dos veces. */
  private readonly sent: Partial<Fields> = {};
  /** Las órdenes de una fila van en fila: cada una usa la versión que dejó la anterior. */
  private queue: Promise<void> = Promise.resolve();

  protected commit(field: Field): void {
    this.queue = this.queue.then(() => this.save(field));
  }

  private async save(field: Field): Promise<void> {
    const text = this.draft()[field];
    if (text === this.stored()[field] || text === this.sent[field]) return;
    if (this.fieldState(field).invalid()) return;

    this.sent[field] = text;
    const result = await this.send(field, text);
    if (result.ok) {
      this.knownVersion.set(result.version ?? this.knownVersion() + 1);
      this.markSaved(field, text);
      void this.announcer.announce(`${FIELD_NAMES[field]} de ${this.label()} guardado`);
    } else {
      delete this.sent[field];
      const message = this.failureMessage(field, result.failure);
      this.rejections.update((current) => ({ ...current, [field]: { value: text, message } }));
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
    }
  }

  private failureMessage(field: Field, failure: CommandFailure): string {
    if (failure.code === 'sku-conflict') {
      const { occupiedBy, productId } = (failure.details ?? {}) as { occupiedBy?: VariantId; productId?: ProductId };
      if (productId !== this.productId()) return 'Ese SKU ya lo usa una variante de otro producto';
      const other = occupiedBy && this.labelOf()(occupiedBy);
      return other ? `Ese SKU ya lo usa la variante ${other}` : 'Ese SKU ya lo usa una variante archivada de este producto';
    }
    if (failure.code === 'version-conflict') {
      const current = this.stored()[field] || 'sin definir';
      return `Cambió mientras la editabas: ahora es «${current}». Si querés tu valor, volvé a guardarlo.`;
    }
    return commandErrorMessage(failure.code);
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
    }
  }
}

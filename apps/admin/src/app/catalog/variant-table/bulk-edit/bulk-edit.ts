import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { form, FormField, submit, validate } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import type { CommandResult } from '@ecommerce/application/client';
import type { CurrencyCode, ProductId, TenantId, Variant } from '@ecommerce/domain';
import { CATALOG_COMMANDS } from '../../../core/client';
import { commandErrorMessage } from '../../../shared/command-errors';
import { injectCan } from '../../../tenant/current-access';
import { parseMoneyInput, parseStockInput } from '../../shared/amount-input';

type BulkField = 'price' | 'compareAtPrice' | 'stock';

const FIELD_NAMES: Record<BulkField, string> = { price: 'Precio', compareAtPrice: 'Precio tachado', stock: 'Existencias' };

/**
 * Edición masiva (T058, FR-028): el mismo importe o la misma cantidad a las variantes seleccionadas,
 * en una sola orden. El servidor la aplica entera o no la aplica, y deja una entrada de bitácora por
 * variante con el mismo lote (FR-030).
 */
@Component({
  selector: 'app-bulk-edit',
  imports: [FormField, MatFormField, MatLabel, MatError, MatInput, MatButton],
  template: `
    <form novalidate (submit)="$event.preventDefault(); apply()" aria-labelledby="edicion-masiva">
      <p id="edicion-masiva" class="count">
        {{ variants().length === 1 ? '1 variante seleccionada' : variants().length + ' variantes seleccionadas' }}
      </p>
      <div class="controls">
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Campo</mat-label>
          <select matNativeControl [formField]="bulkForm.field">
            @if (canWritePrice()) {
              <option value="price">Precio ({{ currency() }})</option>
              <option value="compareAtPrice">Precio tachado ({{ currency() }})</option>
            }
            @if (canWriteStock()) {
              <option value="stock">Existencias</option>
            }
          </select>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Valor para todas</mat-label>
          <input matInput autocomplete="off" [attr.inputmode]="model().field === 'stock' ? 'numeric' : 'decimal'" [placeholder]="placeholder()" [formField]="bulkForm.value" />
          @if (bulkForm.value().errors()[0]; as error) {
            <mat-error>{{ error.message }}</mat-error>
          }
        </mat-form-field>
        <button matButton="filled" type="submit" [disabled]="bulkForm().submitting()">
          Aplicar a {{ variants().length === 1 ? '1 variante' : variants().length + ' variantes' }}
        </button>
      </div>
      <div role="alert" class="failure">{{ failure() }}</div>
    </form>
  `,
  styles: `
    :host {
      display: block;
      position: sticky;
      bottom: 0;
      z-index: 1;
      padding: 12px;
      border-radius: 12px;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }

    .count {
      margin: 0 0 8px;
      font: var(--mat-sys-title-small);
    }

    .controls {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      align-items: center;
      gap: 8px;
    }

    .failure {
      margin-top: 8px;
      color: var(--mat-sys-error);
    }

    .failure:empty {
      display: none;
    }
  `,
})
export class BulkEdit {
  readonly tenantId = input.required<TenantId>();
  readonly productId = input.required<ProductId>();
  readonly currency = input.required<CurrencyCode>();
  readonly variants = input.required<readonly Variant[]>();

  private readonly commands = inject(CATALOG_COMMANDS);
  private readonly announcer = inject(LiveAnnouncer);

  protected readonly canWritePrice = injectCan('variant.price.write');
  protected readonly canWriteStock = injectCan('variant.stock.write');
  /** Solo los campos que el rol puede cambiar (T079); si pierde el elegido, pasa al primero que quede. */
  private readonly fields = computed<readonly BulkField[]>(() => [
    ...(this.canWritePrice() ? (['price', 'compareAtPrice'] as const) : []),
    ...(this.canWriteStock() ? (['stock'] as const) : []),
  ]);
  protected readonly model = linkedSignal<readonly BulkField[], { field: BulkField; value: string }>({
    source: this.fields,
    computation: (fields, previous) => (previous && fields.includes(previous.value.field) ? previous.value : { field: fields[0] ?? 'price', value: '' }),
  });
  protected readonly bulkForm = form(this.model, (path) => {
    validate(path.value, ({ value, valueOf }) => {
      const field = valueOf(path.field);
      if (field === 'stock') {
        const parsed = parseStockInput(value());
        return parsed.ok ? undefined : { kind: 'format', message: parsed.message };
      }
      const parsed = parseMoneyInput(value(), this.currency());
      if (!parsed.ok) return { kind: 'format', message: parsed.message };
      return field === 'price' && parsed.value === null ? { kind: 'required', message: 'Escribí el precio: no se puede quitar' } : undefined;
    });
  });
  protected readonly failure = signal('');
  protected readonly placeholder = computed(() => {
    switch (this.model().field) {
      case 'stock':
        return 'Vacío = sin definir';
      case 'compareAtPrice':
        return 'Vacío = sin tachado';
      case 'price':
        return '';
    }
  });

  protected apply(): void {
    this.failure.set('');
    void submit(this.bulkForm, async () => {
      const { field, value } = this.model();
      const count = this.variants().length;
      const result = await this.send(field, value);
      if (result.ok) {
        this.model.update((current) => ({ ...current, value: '' }));
        void this.announcer.announce(`${FIELD_NAMES[field]} aplicado a ${count === 1 ? '1 variante' : `${count} variantes`}`);
      } else {
        this.failure.set(
          result.code === 'version-conflict'
            ? 'Alguna variante cambió mientras tanto. No se aplicó a ninguna: revisá los valores y volvé a aplicar.'
            : commandErrorMessage(result.code),
        );
      }
      return undefined;
    });
  }

  private async send(field: BulkField, text: string): Promise<CommandResult<unknown>> {
    const base = this.variants().map((variant) => ({ variantId: variant.id, version: variant.version }));
    const productId = this.productId();
    if (field === 'stock') {
      const parsed = parseStockInput(text);
      if (!parsed.ok) throw new Error('Existencias inválidas después de validar');
      return this.commands.setVariantStock(this.tenantId(), { productId, changes: base.map((change) => ({ ...change, stock: parsed.value })) });
    }
    const parsed = parseMoneyInput(text, this.currency());
    if (!parsed.ok) throw new Error('Importe inválido después de validar');
    const amount = parsed.value;
    if (field === 'price') {
      if (!amount) throw new Error('Precio vacío después de validar');
      return this.commands.setVariantPrice(this.tenantId(), { productId, changes: base.map((change) => ({ ...change, price: amount })) });
    }
    return this.commands.setVariantPrice(this.tenantId(), { productId, changes: base.map((change) => ({ ...change, compareAtPrice: amount })) });
  }
}

import { Component, computed, inject, input, signal } from '@angular/core';
import { MatCheckbox } from '@angular/material/checkbox';
import type { CurrencyCode, Money, Product, ProductId, TenantId, Variant, VariantId } from '@ecommerce/domain';
import { CATALOG_QUERIES } from '../../core/client';
import { liveResource } from '../../shared/live-resource';
import { injectCan } from '../../tenant/current-access';
import { combinationLabel, sortVariants } from '../shared/variant-labels';
import { BulkEdit } from './bulk-edit/bulk-edit';
import { VariantRow } from './variant-row';

/**
 * Una fila por combinación, en el orden de las opciones (T056, FR-018). Las filas llegan en tiempo
 * real: al guardar opciones nuevas, la tabla se regenera sola con lo que confirmó el servidor.
 *
 * Los costos se piden aparte y solo con `variant.cost.read` (T078, FR-015): sin ese permiso, la
 * columna no aparece y el documento ni se solicita.
 */
@Component({
  selector: 'app-variant-table',
  imports: [VariantRow, BulkEdit, MatCheckbox],
  template: `
    <h2 id="variantes">Variantes ({{ rows().length }})</h2>
    @if (bulkEditable() && rows().length > 1) {
      <mat-checkbox
        aria-label="Seleccionar todas las variantes"
        [checked]="allSelected()"
        [indeterminate]="selection().length > 0 && !allSelected()"
        (change)="selectAll($event.checked)"
      >
        Seleccionar todas
      </mat-checkbox>
    }
    <ul>
      @for (row of rows(); track row.variant.id) {
        <li>
          <app-variant-row
            [tenantId]="tenantId()"
            [productId]="product().id"
            [variant]="row.variant"
            [label]="row.label"
            [currency]="currency()"
            [labelOf]="labelOf"
            [cost]="costOf(row.variant.id)"
            [selectable]="bulkEditable()"
            [selected]="isSelected(row.variant.id)"
            (selectedChange)="select(row.variant.id, $event)"
          />
        </li>
      }
    </ul>
    @if (bulkEditable() && selection().length > 0) {
      <app-bulk-edit [tenantId]="tenantId()" [productId]="product().id" [currency]="currency()" [variants]="selection()" />
    }
  `,
  styles: `
    h2 {
      margin: 0 0 8px;
      font: var(--mat-sys-title-large);
    }

    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
  `,
})
export class VariantTable {
  readonly tenantId = input.required<TenantId>();
  readonly product = input.required<Product>();
  readonly variants = input.required<readonly Variant[]>();
  readonly currency = input.required<CurrencyCode>();

  private readonly queries = inject(CATALOG_QUERIES);
  private readonly canReadCost = injectCan('variant.cost.read');
  private readonly canWritePrice = injectCan('variant.price.write');
  private readonly canWriteStock = injectCan('variant.stock.write');
  /** La edición masiva cambia precios o existencias: sin permiso para ninguno, no se ofrece. */
  protected readonly bulkEditable = computed(() => this.canWritePrice() || this.canWriteStock());

  private readonly costs = liveResource<ReadonlyMap<VariantId, Money>, { tenantId: TenantId; productId: ProductId }>({
    params: () => (this.canReadCost() ? { tenantId: this.tenantId(), productId: this.product().id } : undefined),
    subscribe: ({ tenantId, productId }, watcher) => this.queries.watchCosts(tenantId, productId, watcher),
  });

  /** `undefined` mientras cargan (o sin permiso, y entonces la fila ni muestra el campo). */
  protected readonly costOf = (id: VariantId): Money | null | undefined => (this.costs.hasValue() ? (this.costs.value().get(id) ?? null) : undefined);

  protected readonly rows = computed(() => {
    const options = this.product().options;
    return sortVariants(options, this.variants()).map((variant) => ({ variant, label: combinationLabel(options, variant.optionValues) }));
  });

  protected readonly labelOf = (id: VariantId): string | undefined => this.rows().find((row) => row.variant.id === id)?.label;

  private readonly selectedIds = signal<ReadonlySet<VariantId>>(new Set());
  /** Las seleccionadas que siguen en la tabla, con su versión vigente. */
  protected readonly selection = computed(() => this.rows().filter((row) => this.selectedIds().has(row.variant.id)).map((row) => row.variant));
  protected readonly allSelected = computed(() => this.rows().length > 0 && this.selection().length === this.rows().length);

  protected isSelected(id: VariantId): boolean {
    return this.selectedIds().has(id);
  }

  protected select(id: VariantId, selected: boolean): void {
    this.selectedIds.update((ids) => {
      const next = new Set(ids);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  protected selectAll(selected: boolean): void {
    this.selectedIds.set(new Set(selected ? this.rows().map((row) => row.variant.id) : []));
  }
}

import { Component, computed, input } from '@angular/core';
import type { CurrencyCode, Product, TenantId, Variant, VariantId } from '@ecommerce/domain';
import { combinationLabel, sortVariants } from '../shared/variant-labels';
import { VariantRow } from './variant-row';

/**
 * Una fila por combinación, en el orden de las opciones (T056, FR-018). Las filas llegan en tiempo
 * real: al guardar opciones nuevas, la tabla se regenera sola con lo que confirmó el servidor.
 */
@Component({
  selector: 'app-variant-table',
  imports: [VariantRow],
  template: `
    <h2 id="variantes">Variantes ({{ rows().length }})</h2>
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
          />
        </li>
      }
    </ul>
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

  protected readonly rows = computed(() => {
    const options = this.product().options;
    return sortVariants(options, this.variants()).map((variant) => ({ variant, label: combinationLabel(options, variant.optionValues) }));
  });

  protected readonly labelOf = (id: VariantId): string | undefined => this.rows().find((row) => row.variant.id === id)?.label;
}

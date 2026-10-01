import { Component, computed, inject, input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { InvalidIdentifierError, productId, tenantId, type Product, type ProductId, type TenantId, type Variant } from '@ecommerce/domain';
import { EmptyState, ErrorState, Skeleton } from '@ecommerce/ui';
import { CATALOG_QUERIES } from '../../core/client';
import { liveResource } from '../../shared/live-resource';
import { CURRENT_TENANT } from '../../tenant/current-tenant';
import { VariantTable } from '../variant-table/variant-table';
import { DetailsSection } from './details-section';
import { OptionsEditor } from './options-editor/options-editor';
import { StatusControl } from './status-control/status-control';

interface Ids {
  readonly tenantId: TenantId;
  readonly productId: ProductId;
}

const STATUS_LABELS: Record<Product['status'], string> = { draft: 'Borrador', active: 'Activo', unlisted: 'No listado' };

/** Un producto: sus datos, sus opciones de variación y una fila por variante (T055, T056). */
@Component({
  selector: 'app-product-editor',
  imports: [RouterLink, MatButton, Skeleton, ErrorState, EmptyState, DetailsSection, StatusControl, OptionsEditor, VariantTable],
  templateUrl: './product-editor.html',
  styleUrl: './product-editor.scss',
})
export class ProductEditor {
  readonly tenantId = input.required<string>();
  readonly productId = input.required<string>();

  private readonly queries = inject(CATALOG_QUERIES);
  private readonly tenant = inject(CURRENT_TENANT);

  private readonly ids = computed(() => parseIds(this.tenantId(), this.productId()));
  protected readonly product = liveResource<Product | null, Ids>({
    params: () => this.ids(),
    subscribe: (ids, watcher) => this.queries.watchProduct(ids.tenantId, ids.productId, watcher),
  });
  protected readonly variants = liveResource<readonly Variant[], Ids>({
    params: () => this.ids(),
    subscribe: (ids, watcher) => this.queries.watchVariants(ids.tenantId, ids.productId, watcher),
  });

  protected readonly currency = computed(() => this.tenant()?.currency);
  protected readonly catalogLink = computed(() => ['/t', this.tenantId(), 'catalog']);
  protected readonly missing = computed(() => this.ids() === undefined || (this.product.hasValue() && this.product.value() === null));

  protected statusLabel(product: Product): string {
    return STATUS_LABELS[product.status];
  }
}

function parseIds(rawTenant: string, rawProduct: string): Ids | undefined {
  try {
    return { tenantId: tenantId(rawTenant), productId: productId(rawProduct) };
  } catch (error) {
    if (error instanceof InvalidIdentifierError) return undefined;
    throw error;
  }
}

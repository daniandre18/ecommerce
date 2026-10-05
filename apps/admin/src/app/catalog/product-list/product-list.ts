import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { debounce, disabled, form, FormField } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { ProductListQuery } from '@ecommerce/application';
import { tenantId, type Product, type ProductStatus, type TenantId } from '@ecommerce/domain';
import { EmptyState, ErrorState, Skeleton } from '@ecommerce/ui';
import { CATALOG_QUERIES } from '../../core/client';
import { HasPermission } from '../../shared/directives/has-permission.directive';
import { liveResource } from '../../shared/live-resource';
import { injectCan } from '../../tenant/current-access';
import { CreateProductDialog, type CreatedProduct, type CreateProductData } from '../create-product/create-product-dialog';

export const PAGE_SIZE = 25;

const STATUS_LABELS: Record<ProductStatus, string> = { draft: 'Borrador', active: 'Activo', unlisted: 'No listado' };

type StatusFilter = ProductStatus | 'all';

/** Un filtro de la ficha de tienda a la vez (FR-017, FR-035): Firestore admite una condición de arreglo. */
type AttributeFilter = 'none' | 'missing' | 'tag' | 'brand';

interface Filters {
  search: string;
  status: StatusFilter;
  attribute: AttributeFilter;
  attributeValue: string;
}

const NO_FILTERS: Filters = { search: '', status: 'all', attribute: 'none', attributeValue: '' };

/**
 * El catálogo de un comercio (T054). No lee variantes: el resumen de cada producto (cantidad, si
 * alguna está incompleta) viaja en su propio documento, y las variantes se leen al abrirlo.
 */
@Component({
  selector: 'app-product-list',
  imports: [RouterLink, FormField, MatFormField, MatLabel, MatInput, MatButton, Skeleton, ErrorState, EmptyState, HasPermission],
  template: `
    <div class="head">
      <h1>Catálogo</h1>
      <button *appHasPermission="'catalog.write'" matButton="filled" type="button" (click)="create()">Nuevo producto</button>
    </div>

    <div class="filters">
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Buscar por nombre</mat-label>
        <input matInput type="search" autocomplete="off" [formField]="filterForm.search" />
      </mat-form-field>
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Estado</mat-label>
        <select matNativeControl [formField]="filterForm.status">
          <option value="all">Todos</option>
          <option value="active">Activos</option>
          <option value="draft">Borradores</option>
          <option value="unlisted">No listados</option>
        </select>
      </mat-form-field>
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Mostrar</mat-label>
        <select matNativeControl data-field="attribute" [formField]="filterForm.attribute">
          <option value="none">Todos los productos</option>
          <option value="missing">Con datos de envío faltantes</option>
          <option value="tag">Con la etiqueta…</option>
          <option value="brand">De la marca…</option>
        </select>
      </mat-form-field>
      @if (filters().attribute === 'tag' || filters().attribute === 'brand') {
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{ filters().attribute === 'tag' ? 'Etiqueta' : 'Marca' }}</mat-label>
          <input matInput data-field="attributeValue" autocomplete="off" [formField]="filterForm.attributeValue" />
        </mat-form-field>
      }
    </div>
    @if (searching() && filters().attribute !== 'none') {
      <p class="hint">La búsqueda por nombre no se combina con este filtro: se aplica cuando borrás la búsqueda.</p>
    }

    @if (products.error()) {
      <ui-error-state heading="No pudimos cargar el catálogo" (retry)="products.reload()" />
    } @else if (shown(); as list) {
      @if (list.length === 0) {
        @if (filtered()) {
          <ui-empty-state heading="Ningún producto coincide con la búsqueda">
            <button matButton type="button" (click)="clearFilters()">Quitar filtros</button>
          </ui-empty-state>
        } @else {
          <ui-empty-state heading="Todavía no hay productos" [message]="canWrite() ? 'Creá el primero para empezar a armar tu catálogo.' : ''">
            <button *appHasPermission="'catalog.write'" matButton="filled" type="button" (click)="create()">Crear producto</button>
          </ui-empty-state>
        }
      } @else {
        <ul [attr.aria-busy]="products.isLoading()">
          @for (product of list; track product.id) {
            <li>
              <a [routerLink]="product.id">
                <span class="name">{{ product.name }}</span>
                <span class="meta">{{ statusLabel(product) }} · {{ variantsLabel(product) }}</span>
                @if (product.hasIncompleteVariants) {
                  <span class="incomplete">Variantes sin SKU</span>
                }
                <!-- Una marca para completar, nunca un bloqueo (FR-017). -->
                @if (product.missingShippingData) {
                  <span class="missing-shipping">Faltan datos de envío</span>
                }
              </a>
            </li>
          }
        </ul>
        @if (list.length >= pageSize()) {
          <button matButton type="button" class="more" (click)="loadMore()">Cargar más</button>
        }
      }
    } @else {
      <ui-skeleton rows="5" rowHeight="72px" label="Cargando el catálogo…" />
    }
  `,
  styles: `
    /* El alto del botón, reservado: aparece cuando llega el acceso y no empuja los filtros. */
    .head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 48px;
    }

    h1 {
      margin: 0;
      font: var(--mat-sys-headline-small);
    }

    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 16px 0;
    }

    .filters mat-form-field {
      flex: 1 1 200px;
    }

    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    li {
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    /* El alto de la fila es el del esqueleto: nada salta cuando llegan los datos (SC-009). */
    a {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 72px;
      box-sizing: border-box;
      padding: 8px 4px;
      color: inherit;
      text-decoration: none;
    }

    a:hover .name {
      text-decoration: underline;
    }

    .name {
      font: var(--mat-sys-title-medium);
      overflow-wrap: anywhere;
    }

    .meta {
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    .incomplete {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-error);
    }

    .missing-shipping {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    .hint {
      margin: -8px 0 16px;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    .more {
      margin-top: 8px;
    }
  `,
})
export class ProductList {
  readonly tenantId = input.required<string>();

  private readonly queries = inject(CATALOG_QUERIES);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly canWrite = injectCan('catalog.write');

  protected readonly filters = signal<Filters>(NO_FILTERS);
  protected readonly searching = computed(() => this.filters().search.trim() !== '');
  protected readonly filterForm = form(this.filters, (path) => {
    debounce(path.search, 300);
    debounce(path.attributeValue, 300);
    // La búsqueda ordena por nombre: combinarla con estos filtros pediría un índice por combinación.
    disabled(path.attribute, { when: () => this.searching() });
  });
  protected readonly pageSize = signal(PAGE_SIZE);

  private readonly request = computed(() => {
    const { search, status } = this.filters();
    const query: ProductListQuery = {
      limit: this.pageSize(),
      ...(status === 'all' ? {} : { status }),
      ...(search.trim() === '' ? this.attributeQuery() : { search: search.trim() }),
    };
    return { tenantId: tenantId(this.tenantId()), query };
  });

  protected readonly products = liveResource<readonly Product[], { tenantId: TenantId; query: ProductListQuery }>({
    params: () => this.request(),
    subscribe: ({ tenantId: id, query }, watcher) => this.queries.watchProducts(id, query, watcher),
  });

  /** Lo último que llegó se sigue viendo mientras carga lo siguiente: más resultados u otro filtro. */
  protected readonly shown = linkedSignal<readonly Product[] | undefined, readonly Product[] | undefined>({
    source: () => (this.products.hasValue() ? this.products.value() : undefined),
    computation: (value, previous) => value ?? previous?.value,
  });

  protected readonly filtered = computed(() => {
    const { status, search, attribute } = this.filters();
    return status !== 'all' || search.trim() !== '' || attribute !== 'none';
  });

  /** El filtro de la ficha elegido; etiqueta y marca, recién cuando tienen un valor. */
  private attributeQuery(): Partial<ProductListQuery> {
    const { attribute, attributeValue } = this.filters();
    const value = attributeValue.trim();
    if (attribute === 'missing') return { missingShippingData: true };
    if (attribute === 'tag' && value) return { tag: value };
    if (attribute === 'brand' && value) return { brand: value };
    return {};
  }

  protected statusLabel(product: Product): string {
    return STATUS_LABELS[product.status];
  }

  protected variantsLabel(product: Product): string {
    return product.variantCount === 1 ? '1 variante' : `${product.variantCount} variantes`;
  }

  protected loadMore(): void {
    this.pageSize.update((size) => size + PAGE_SIZE);
  }

  protected clearFilters(): void {
    this.filters.set(NO_FILTERS);
    this.pageSize.set(PAGE_SIZE);
  }

  protected create(): void {
    const data: CreateProductData = { tenantId: tenantId(this.tenantId()) };
    this.dialog
      .open<CreateProductDialog, CreateProductData, CreatedProduct>(CreateProductDialog, { data, width: 'min(560px, 100vw - 32px)' })
      .afterClosed()
      .subscribe((created) => {
        if (!created) return;
        // La URL final: puede no ser la de la vista previa si otra creación la tomó antes (T038a).
        this.snackBar.open(created.slug ? `Creaste «${created.name}» en …/${created.slug}` : `Creaste «${created.name}»`, undefined, { duration: 4000 });
        // Lo siguiente que se hace con un producto nuevo es armar sus variantes.
        void this.router.navigate([created.productId], { relativeTo: this.route });
      });
  }
}

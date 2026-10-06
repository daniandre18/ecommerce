import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { debounce, disabled, form, FormField } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { ProductListQuery } from '@ecommerce/application';
import {
  descendantsOf,
  emptyCategoryTree,
  emptySections,
  MAX_SECTION_PRODUCTS,
  SECTION_IDS,
  tenantId,
  type CategoryId,
  type CategoryTree,
  type FeaturedSections,
  type Product,
  type ProductId,
  type ProductStatus,
  type SectionId,
  type TenantId,
} from '@ecommerce/domain';
import { EmptyState, ErrorState, Skeleton } from '@ecommerce/ui';
import { CATALOG_COMMANDS, CATALOG_QUERIES } from '../../core/client';
import { commandErrorMessage } from '../../shared/command-errors';
import { HasPermission } from '../../shared/directives/has-permission.directive';
import { liveResource } from '../../shared/live-resource';
import { CURRENT_ACCESS, injectCan } from '../../tenant/current-access';
import { inTreeOrder, pathLabel } from '../categories/category-messages';
import { CreateProductDialog, type CreatedProduct, type CreateProductData } from '../create-product/create-product-dialog';
import { SECTION_LABELS, unseenReason } from '../shared/sections';
import { BulkActions } from './bulk-actions';

export const PAGE_SIZE = 25;

const STATUS_LABELS: Record<ProductStatus, string> = { draft: 'Borrador', active: 'Activo', unlisted: 'No listado' };

type StatusFilter = ProductStatus | 'all';

/**
 * Un filtro de la ficha de tienda, una categoría o una sección a la vez (FR-017, FR-023, FR-027c,
 * FR-035): Firestore admite una sola condición de arreglo por consulta.
 */
type AttributeFilter = 'none' | 'missing' | 'tag' | 'brand' | 'category' | SectionId;

interface Filters {
  search: string;
  status: StatusFilter;
  attribute: AttributeFilter;
  attributeValue: string;
  category: string;
}

const NO_FILTERS: Filters = { search: '', status: 'all', attribute: 'none', attributeValue: '', category: '' };

/**
 * El catálogo de un comercio (T054). No lee variantes: el resumen de cada producto (cantidad, si
 * alguna está incompleta) viaja en su propio documento, y las variantes se leen al abrirlo.
 */
@Component({
  selector: 'app-product-list',
  imports: [RouterLink, FormField, MatFormField, MatLabel, MatInput, MatButton, MatCheckbox, Skeleton, ErrorState, EmptyState, HasPermission, BulkActions],
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
          <option value="category">De la categoría…</option>
          @for (section of sectionIds; track section) {
            <option [value]="section">En {{ sectionLabels[section] }} ({{ sections()[section].length }} de {{ maxSection }})</option>
          }
        </select>
      </mat-form-field>
      @if (filters().attribute === 'category') {
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Categoría</mat-label>
          <!-- Incluye sus subcategorías (FR-023). -->
          <select matNativeControl data-field="category" [formField]="filterForm.category">
            <option value="">Elegí una</option>
            @for (option of categoryOptions(); track option.value) {
              <option [value]="option.value">{{ option.label }}</option>
            }
          </select>
        </mat-form-field>
      }
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
    @if (section(); as current) {
      <!-- El contador, también en el listado filtrado por la sección (FR-027a). -->
      <p class="section-count">{{ sectionLabels[current] }}: {{ sections()[current].length }} de {{ maxSection }}</p>
      <div role="alert" class="row-failure">{{ rowFailure() }}</div>
    }

    @if (products.error()) {
      <ui-error-state heading="No pudimos cargar el catálogo" (retry)="products.reload()" />
    } @else if (listed(); as list) {
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
        @if (canSelect()) {
          <mat-checkbox
            class="select-all"
            aria-label="Seleccionar todos los de la lista"
            [checked]="list.length > 0 && selected().size === list.length"
            [indeterminate]="selected().size > 0 && selected().size < list.length"
            (change)="selectAll(list, $event.checked)"
          >
            Seleccionar todos
          </mat-checkbox>
          @if (selected().size > 0) {
            <app-bulk-actions
              [tenantId]="id()"
              [products]="selectedProducts()"
              [tree]="tree()"
              [sections]="sections()"
              (cleared)="clearSelection()"
              (deselected)="deselect($event)"
            />
          }
        }
        <ul [attr.aria-busy]="products.isLoading()">
          @for (product of list; track product.id) {
            <li [class.selectable]="canSelect()">
              @if (canSelect()) {
                <mat-checkbox
                  class="pick"
                  [aria-label]="'Seleccionar «' + product.name + '»'"
                  [checked]="selected().has(product.id)"
                  (change)="toggle(product.id, $event.checked)"
                />
              }
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
                @if (section() && unseen(product); as reason) {
                  <span class="unseen">La tienda no lo muestra: está {{ reason }}</span>
                }
              </a>
              @if (section(); as current) {
                @if (canWrite()) {
                  <button
                    matButton
                    type="button"
                    class="remove"
                    [attr.aria-label]="'Quitar «' + product.name + '» de ' + sectionLabels[current]"
                    (click)="removeFromSection(current, product)"
                  >
                    Quitar de {{ sectionLabels[current] }}
                  </button>
                }
              }
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

    li.selectable {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    li.selectable a {
      flex: 1 1 auto;
      min-width: 0;
    }

    .select-all {
      display: block;
      margin-bottom: 8px;
    }

    .section-count {
      margin: -8px 0 8px;
      font: var(--mat-sys-title-small);
    }

    .unseen {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    .row-failure {
      color: var(--mat-sys-error);
    }

    .row-failure:empty {
      display: none;
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
  private readonly commands = inject(CATALOG_COMMANDS);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly canWrite = injectCan('catalog.write');
  private readonly access = inject(CURRENT_ACCESS);

  protected readonly filters = signal<Filters>(NO_FILTERS);
  protected readonly searching = computed(() => this.filters().search.trim() !== '');
  protected readonly filterForm = form(this.filters, (path) => {
    debounce(path.search, 300);
    debounce(path.attributeValue, 300);
    // La búsqueda ordena por nombre: combinarla con estos filtros pediría un índice por combinación.
    disabled(path.attribute, { when: () => this.searching() });
  });
  protected readonly pageSize = signal(PAGE_SIZE);
  protected readonly maxSection = MAX_SECTION_PRODUCTS;
  protected readonly sectionIds = SECTION_IDS;
  protected readonly sectionLabels = SECTION_LABELS;
  protected readonly id = computed(() => tenantId(this.tenantId()));
  protected readonly canPrice = injectCan('variant.price.write');
  /** Se selecciona para una acción masiva: con permiso de catálogo o con el de precios (FR-029). */
  protected readonly canSelect = computed(() => this.canWrite() || this.canPrice());

  /** El árbol de categorías: para filtrar por una rama y para la acción masiva (Historia 2 de la 002). */
  private readonly categories = liveResource<CategoryTree, TenantId>({
    params: () => tenantId(this.tenantId()),
    subscribe: (id, watcher) => this.queries.watchCategoryTree(id, watcher),
  });
  protected readonly tree = computed(() => (this.categories.hasValue() ? (this.categories.value() ?? emptyCategoryTree()) : emptyCategoryTree()));
  /** Destacados y Ofertas: los contadores, y los ids del listado filtrado por una de ellas. */
  private readonly sectionsResource = liveResource<FeaturedSections, TenantId>({
    params: () => tenantId(this.tenantId()),
    subscribe: (id, watcher) => this.queries.watchSections(id, watcher),
  });
  protected readonly sections = computed(() => (this.sectionsResource.hasValue() ? (this.sectionsResource.value() ?? emptySections()) : emptySections()));
  /** La sección por la que se filtra, si es eso lo que se eligió en "Mostrar". */
  protected readonly section = computed<SectionId | null>(() => {
    const attribute = this.filters().attribute;
    return attribute === 'featured' || attribute === 'offers' ? attribute : null;
  });
  protected readonly rowFailure = signal('');
  protected readonly categoryOptions = computed(() => {
    const tree = this.tree();
    return inTreeOrder(tree).map((node) => ({ value: node.id as string, label: pathLabel(tree, node.id) }));
  });

  private readonly request = computed(
    () => {
      const { search, status } = this.filters();
      const query: ProductListQuery = {
        limit: this.pageSize(),
        ...(status === 'all' ? {} : { status }),
        ...(search.trim() === '' ? this.attributeQuery() : { search: search.trim() }),
      };
      return { tenantId: tenantId(this.tenantId()), query };
    },
    // La rama se recalcula con cada cambio del árbol: si es la misma, no se vuelve a suscribir.
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );

  protected readonly products = liveResource<readonly Product[], { tenantId: TenantId; query: ProductListQuery }>({
    params: () => this.request(),
    subscribe: ({ tenantId: id, query }, watcher) => this.queries.watchProducts(id, query, watcher),
  });

  /** Lo último que llegó se sigue viendo mientras carga lo siguiente: más resultados u otro filtro. */
  protected readonly shown = linkedSignal<readonly Product[] | undefined, readonly Product[] | undefined>({
    source: () => (this.products.hasValue() ? this.products.value() : undefined),
    computation: (value, previous) => value ?? previous?.value,
  });
  /**
   * La lista se muestra cuando además se sabe qué puede hacer la cuenta: las casillas para seleccionar
   * dependen de eso, y si llegaran después correrían cada fila (como en el editor de producto).
   */
  protected readonly listed = computed(() => (this.access() === undefined ? undefined : this.shown()));

  protected readonly filtered = computed(() => {
    const { status, search, attribute } = this.filters();
    return status !== 'all' || search.trim() !== '' || attribute !== 'none';
  });

  // ── Selección para las acciones masivas (FR-025, FR-029) ─────────────────────────────────────

  /** Lo seleccionado se vacía al cambiar los filtros: no queda nada elegido que ya no se ve. */
  protected readonly selected = linkedSignal<Filters, ReadonlySet<ProductId>>({ source: this.filters, computation: () => new Set() });
  /** Los seleccionados, con su versión, de lo que se está viendo. */
  protected readonly selectedProducts = computed(() => (this.listed() ?? []).filter((product) => this.selected().has(product.id)));

  /** El filtro de la ficha elegido; etiqueta y marca, recién cuando tienen un valor. */
  private attributeQuery(): Partial<ProductListQuery> {
    const { attribute, attributeValue } = this.filters();
    const value = attributeValue.trim();
    if (attribute === 'missing') return { missingShippingData: true };
    if (attribute === 'tag' && value) return { tag: value };
    if (attribute === 'brand' && value) return { brand: value };
    if (attribute === 'category') return this.categoryQuery();
    if (attribute === 'featured' || attribute === 'offers') return { productIds: [...this.sections()[attribute]] };
    return {};
  }

  /** La categoría y todas sus subcategorías: el producto guarda solo las asignadas (FR-023). */
  private categoryQuery(): Partial<ProductListQuery> {
    const id = this.filters().category as CategoryId;
    const tree = this.tree();
    if (!id || !tree.nodes[id]) return {};
    return { categoryIds: [id, ...descendantsOf(tree, id)] };
  }

  protected toggle(id: ProductId, checked: boolean): void {
    this.selected.update((selected) => {
      const next = new Set(selected);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  protected selectAll(list: readonly Product[], checked: boolean): void {
    this.selected.set(checked ? new Set(list.map((p) => p.id)) : new Set());
  }

  protected clearSelection(): void {
    this.selected.set(new Set());
  }

  protected deselect(ids: readonly ProductId[]): void {
    this.selected.update((selected) => new Set([...selected].filter((id) => !ids.includes(id))));
  }

  protected unseen(product: Product): string | null {
    return unseenReason(product);
  }

  /** Desde el listado filtrado por una sección, se la quita a un producto (FR-027c). */
  protected async removeFromSection(section: SectionId, product: Product): Promise<void> {
    this.rowFailure.set('');
    const result = await this.commands.removeFromSection(this.id(), { section, productIds: [product.id] });
    if (result.ok) {
      void this.announcer.announce(`«${product.name}» salió de ${SECTION_LABELS[section]}.`);
    } else {
      this.rowFailure.set(commandErrorMessage(result.code));
    }
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

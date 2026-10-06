import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAX_BULK_PRODUCTS, type CommandFailure } from '@ecommerce/application';
import {
  MAX_SECTION_PRODUCTS,
  SECTION_IDS,
  type CategoryId,
  type CategoryTree,
  type FeaturedSections,
  type Product,
  type ProductId,
  type SectionId,
  type TenantId,
} from '@ecommerce/domain';
import { CATALOG_COMMANDS } from '../../core/client';
import { commandErrorMessage } from '../../shared/command-errors';
import { injectCan } from '../../tenant/current-access';
import { inTreeOrder, pathLabel } from '../categories/category-messages';
import { SECTION_LABELS, sectionFullMessage } from '../shared/sections';

type SaleCondition = { readonly priceVisible: boolean } | { readonly freeShipping: boolean };

/** Qué dice cada acción de condiciones de venta al terminar, sobre "los N productos seleccionados". */
const SALE_DONE: Record<string, string> = {
  'priceVisible:false': 'Se ocultó el precio',
  'priceVisible:true': 'Se mostró el precio',
  'freeShipping:true': 'Se activó el envío gratis',
  'freeShipping:false': 'Se quitó el envío gratis',
};

/**
 * Lo que se hace con varios productos a la vez (FR-025, FR-029). Las acciones se separan por el
 * permiso que exigen (research §10): categorías y secciones con `catalog.write`, condiciones de venta
 * con `variant.price.write`. Cada una es todo o nada: si se rechaza, se dice por qué y la selección
 * queda como estaba.
 */
@Component({
  selector: 'app-bulk-actions',
  imports: [MatButton],
  template: `
    <div class="bulk" role="group" aria-label="Acción sobre los seleccionados">
      <p class="bulk-count">{{ products().length }} seleccionados</p>
      @if (tooMany()) {
        <p class="bulk-note">Una acción admite hasta {{ maxBulk }} productos: deseleccioná algunos.</p>
      }
      @if (canWrite()) {
        <fieldset>
          <legend>Categoría</legend>
          <div class="bulk-select">
            <label for="bulk-category">Categoría</label>
            <select id="bulk-category" data-field="bulkCategory" [value]="bulkCategory()" (change)="bulkCategory.set($any($event.target).value)">
              <option value="">Elegí una</option>
              @for (option of categoryOptions(); track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </div>
          <div class="bulk-actions">
            <button matButton type="button" [disabled]="!canCategory()" (click)="categories('unassign')">Quitar</button>
            <button matButton="filled" type="button" [disabled]="!canCategory()" (click)="categories('assign')">Asignar</button>
          </div>
        </fieldset>
        <fieldset>
          <legend>Sección destacada</legend>
          <div class="bulk-select">
            <label for="bulk-section">Sección</label>
            <select id="bulk-section" data-field="bulkSection" [value]="bulkSection()" (change)="bulkSection.set($any($event.target).value)">
              <option value="">Elegí una</option>
              @for (section of sectionIds; track section) {
                <option [value]="section">{{ labels[section] }} ({{ sections()[section].length }} de {{ maxSection }})</option>
              }
            </select>
          </div>
          <div class="bulk-actions">
            <button matButton type="button" [disabled]="!canSection()" (click)="section('remove')">Quitar de la sección</button>
            <button matButton="filled" type="button" [disabled]="!canSection()" (click)="section('add')">Agregar a la sección</button>
          </div>
        </fieldset>
      }
      @if (canPrice()) {
        <fieldset>
          <legend>Condiciones de venta</legend>
          <div class="bulk-actions">
            <button matButton type="button" [disabled]="!ready()" (click)="saleConditions({ priceVisible: false })">Ocultar el precio</button>
            <button matButton type="button" [disabled]="!ready()" (click)="saleConditions({ priceVisible: true })">Mostrar el precio</button>
            <button matButton type="button" [disabled]="!ready()" (click)="saleConditions({ freeShipping: true })">Activar envío gratis</button>
            <button matButton type="button" [disabled]="!ready()" (click)="saleConditions({ freeShipping: false })">Quitar envío gratis</button>
          </div>
        </fieldset>
      }
      <div role="alert" class="bulk-failure">{{ failure() }}</div>
      <div class="bulk-actions">
        @if (retry(); as pending) {
          <button matButton="filled" type="button" (click)="withoutDigital(pending)">Quitar de la selección y reintentar</button>
        }
        <button matButton type="button" (click)="cleared.emit()">Deseleccionar</button>
      </div>
    </div>
  `,
  styles: `
    .bulk {
      margin-bottom: 16px;
      padding: 12px 16px;
      border-radius: 12px;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }

    .bulk-count {
      margin: 0 0 8px;
      font: var(--mat-sys-title-small);
    }

    .bulk-note {
      margin: 0 0 8px;
    }

    fieldset {
      margin: 0 0 12px;
      padding: 0;
      border: 0;
    }

    legend {
      padding: 0;
      margin-bottom: 4px;
      font: var(--mat-sys-label-large);
    }

    .bulk-select {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-width: 360px;
      font: var(--mat-sys-body-medium);
    }

    .bulk-select select {
      min-height: 48px;
      max-width: 100%;
      font: inherit;
    }

    .bulk-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }

    .bulk-failure {
      color: var(--mat-sys-error);
    }

    .bulk-failure:empty {
      display: none;
    }
  `,
})
export class BulkActions {
  readonly tenantId = input.required<TenantId>();
  /** Los seleccionados, con su versión: las condiciones de venta la comparan. */
  readonly products = input.required<readonly Product[]>();
  readonly tree = input.required<CategoryTree>();
  readonly sections = input.required<FeaturedSections>();
  /** La acción terminó: la selección se vacía. */
  readonly cleared = output<void>();
  /** Sacar estos de la selección (los digitales, para reintentar sin ellos). */
  readonly deselected = output<readonly ProductId[]>();

  protected readonly maxBulk = MAX_BULK_PRODUCTS;
  protected readonly maxSection = MAX_SECTION_PRODUCTS;
  protected readonly sectionIds = SECTION_IDS;
  protected readonly labels = SECTION_LABELS;

  private readonly commands = inject(CATALOG_COMMANDS);
  private readonly announcer = inject(LiveAnnouncer);
  protected readonly canWrite = injectCan('catalog.write');
  protected readonly canPrice = injectCan('variant.price.write');

  protected readonly bulkCategory = signal('');
  protected readonly bulkSection = signal<SectionId | ''>('');
  protected readonly failure = signal('');
  /** Tras un rechazo por digitales: qué condición reintentar y sin cuáles. */
  protected readonly retry = signal<{ readonly change: SaleCondition; readonly productIds: readonly ProductId[] } | null>(null);
  private readonly busy = signal(false);

  protected readonly tooMany = computed(() => this.products().length > MAX_BULK_PRODUCTS);
  protected readonly ready = computed(() => this.products().length > 0 && !this.tooMany() && !this.busy());
  protected readonly canCategory = computed(() => this.ready() && this.bulkCategory() !== '');
  protected readonly canSection = computed(() => this.ready() && this.bulkSection() !== '');
  protected readonly categoryOptions = computed(() => {
    const tree = this.tree();
    return inTreeOrder(tree).map((node) => ({ value: node.id as string, label: pathLabel(tree, node.id) }));
  });

  protected async categories(action: 'assign' | 'unassign'): Promise<void> {
    const categoryId = this.bulkCategory() as CategoryId;
    const label = pathLabel(this.tree(), categoryId);
    const input = { categoryId, productIds: this.ids() };
    const done = await this.run(() => (action === 'assign' ? this.commands.assignCategory(this.tenantId(), input) : this.commands.unassignCategory(this.tenantId(), input)));
    if (!done) return;
    const count = input.productIds.length === 1 ? 'al producto seleccionado' : `a los ${input.productIds.length} productos seleccionados`;
    this.finish(action === 'assign' ? `«${label}» quedó asignada ${count}.` : `«${label}» se quitó ${count.replace(/^a/, 'de')}.`);
  }

  protected async section(action: 'add' | 'remove'): Promise<void> {
    const section = this.bulkSection();
    if (!section) return;
    const input = { section, productIds: this.ids() };
    const done = await this.run(() => (action === 'add' ? this.commands.addToSection(this.tenantId(), input) : this.commands.removeFromSection(this.tenantId(), input)));
    if (!done) return;
    const n = input.productIds.length;
    const what = n === 1 ? '1 producto' : `${n} productos`;
    this.finish(action === 'add' ? `Se agregaron ${what} a ${SECTION_LABELS[section]}.` : `Se quitaron ${what} de ${SECTION_LABELS[section]}.`);
  }

  protected async saleConditions(change: SaleCondition, products: readonly Product[] = this.products()): Promise<void> {
    this.retry.set(null);
    const changes = products.map((product) => ({ productId: product.id, version: product.version }));
    const done = await this.run(() => this.commands.setSaleConditions(this.tenantId(), { changes, ...change }), change);
    if (!done) return;
    const [field, value] = Object.entries(change)[0] as [string, boolean];
    const count = changes.length === 1 ? 'del producto seleccionado' : `de los ${changes.length} productos seleccionados`;
    this.finish(`${SALE_DONE[`${field}:${value}`]} ${count}.`);
  }

  /** FR-029: quitar los digitales de la selección y reintentar en la misma pantalla. */
  protected async withoutDigital(pending: { readonly change: SaleCondition; readonly productIds: readonly ProductId[] }): Promise<void> {
    const rest = this.products().filter((product) => !pending.productIds.includes(product.id));
    this.deselected.emit(pending.productIds);
    await this.saleConditions(pending.change, rest);
  }

  private ids(): ProductId[] {
    return this.products().map((product) => product.id);
  }

  private async run(command: () => Promise<{ ok: true } | CommandFailure>, change?: SaleCondition): Promise<boolean> {
    this.busy.set(true);
    this.failure.set('');
    const result = await command();
    this.busy.set(false);
    if (result.ok) return true;
    this.failure.set(this.failureMessage(result));
    if (result.code === 'digital-products' && change) {
      const { productIds = [] } = (result.details ?? {}) as { productIds?: ProductId[] };
      this.retry.set({ change, productIds });
    }
    return false;
  }

  private finish(message: string): void {
    void this.announcer.announce(message);
    this.cleared.emit();
  }

  private failureMessage(failure: CommandFailure): string {
    if (failure.code === 'section-full') return sectionFullMessage(failure.details);
    if (failure.code === 'digital-products') {
      const { names = [] } = (failure.details ?? {}) as { names?: string[] };
      const named = names.map((name) => `«${name}»`).join(', ');
      return `${named} ${names.length === 1 ? 'es digital' : 'son digitales'}: el envío gratis no se ofrece en productos digitales. No se aplicó a ninguno.`;
    }
    if (failure.code === 'limit-exceeded') {
      const full = (failure.details ?? {}) as { productIds?: string[]; max?: number };
      if (full.productIds) {
        const named = full.productIds.map((id) => `«${this.products().find((p) => p.id === id)?.name ?? id}»`).join(', ');
        return `${named} ${full.productIds.length === 1 ? 'ya tiene' : 'ya tienen'} ${full.max ?? 20} categorías: no se asignó a ninguno.`;
      }
    }
    return commandErrorMessage(failure.code);
  }
}

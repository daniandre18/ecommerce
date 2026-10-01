import { Component, computed, inject, input, linkedSignal, resource, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { ActivatedRoute, Router } from '@angular/router';
import type { AuditFilter, AuditPage } from '@ecommerce/application';
import {
  productId,
  tenantId,
  type AuditEventType,
  type Membership,
  type Product,
  type ProductId,
  type TenantId,
  type Variant,
  type VariantId,
} from '@ecommerce/domain';
import { EmptyState, ErrorState, Skeleton } from '@ecommerce/ui';
import { AUDIT_QUERIES, CATALOG_QUERIES, TEAM_QUERIES } from '../../core/client';
import { combinationLabel } from '../../catalog/shared/variant-labels';
import { firstValue } from '../../shared/first-value';
import { liveResource } from '../../shared/live-resource';
import { CURRENT_ACCESS } from '../../tenant/current-access';
import type { EntryNames } from '../entry-detail/describe-entry';
import { EntryDetail } from '../entry-detail/entry-detail';

export const PAGE_SIZE = 25;

const TYPES: readonly { readonly value: AuditEventType; readonly label: string }[] = [
  { value: 'price.changed', label: 'Precios y costo' },
  { value: 'stock.adjusted', label: 'Existencias' },
  { value: 'role.changed', label: 'Equipo y roles' },
  { value: 'platform.action', label: 'Operador de la plataforma' },
];

type FilterKey = 'actor' | 'product' | 'type' | 'from' | 'to';

/** Un producto de la bitácora con el nombre de cada variante viva; `null` si ya no existe. */
type Subject = { readonly name: string; readonly variants: ReadonlyMap<VariantId, string> } | null;

/** `aaaa-mm-dd` del selector de fecha, como la medianoche local de ese día. */
function parseDay(text: string | undefined): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text ?? '');
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined;
}

const nextDay = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);

/**
 * La bitácora del comercio (T085, FR-034): de lo más nuevo a lo más viejo, filtrable por persona,
 * producto, tipo de evento y fechas. Los filtros viven en la dirección: se comparten, sobreviven a
 * recargar y el botón Atrás los recorre. Es solo del Propietario (FR-015: incluye costos).
 */
@Component({
  selector: 'app-audit-log',
  imports: [MatButton, MatFormField, MatLabel, MatInput, Skeleton, ErrorState, EmptyState, EntryDetail],
  template: `
    <h1>Bitácora</h1>
    @if (access() === undefined) {
      <ui-skeleton rows="4" label="Cargando la bitácora…" />
    } @else if (!isOwner()) {
      <ui-empty-state heading="Solo el Propietario consulta la bitácora" message="Registra costos, que tu rol no puede ver." />
    } @else {
      <form class="filters" aria-label="Filtros" (submit)="$event.preventDefault()">
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Persona</mat-label>
          <select matNativeControl (change)="setFilter('actor', $any($event.target).value)">
            <option value="" [selected]="!actor()">Todas</option>
            @for (person of people(); track person.uid) {
              <option [value]="person.uid" [selected]="person.uid === actor()">{{ person.displayName }}</option>
            }
          </select>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Tipo de evento</mat-label>
          <select matNativeControl (change)="setFilter('type', $any($event.target).value)">
            <option value="" [selected]="!filter().type">Todos</option>
            @for (option of types; track option.value) {
              <option [value]="option.value" [selected]="option.value === filter().type">{{ option.label }}</option>
            }
          </select>
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Desde</mat-label>
          <input matInput type="date" [value]="from() ?? ''" (change)="setFilter('from', $any($event.target).value)" />
        </mat-form-field>
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>Hasta</mat-label>
          <input matInput type="date" [value]="to() ?? ''" (change)="setFilter('to', $any($event.target).value)" />
        </mat-form-field>
      </form>

      @if (filter().productId) {
        <p class="product">
          Producto: <strong>{{ productName() }}</strong>
          <button matButton type="button" (click)="setFilter('product', '')">Ver todos los productos</button>
        </p>
      }

      @if (invalidRange()) {
        <p role="alert" class="failure">La fecha «desde» es posterior a «hasta».</p>
      } @else if (firstPage.error()) {
        <ui-error-state heading="No pudimos cargar la bitácora" (retry)="firstPage.reload()" />
      } @else if (!firstPage.hasValue()) {
        <ui-skeleton rows="5" rowHeight="72px" label="Cargando la bitácora…" />
      } @else if (entries().length === 0) {
        @if (filtered()) {
          <ui-empty-state heading="Ninguna entrada coincide con los filtros">
            <button matButton type="button" (click)="clearFilters()">Quitar filtros</button>
          </ui-empty-state>
        } @else {
          <ui-empty-state heading="Todavía no hay cambios registrados" message="Los cambios de precio, de existencias y del equipo van a aparecer acá." />
        }
      } @else {
        <ul aria-label="Entradas de la bitácora">
          @for (entry of entries(); track entry.id) {
            <li><app-entry-detail [tenantId]="id()" [entry]="entry" [names]="names()" /></li>
          }
        </ul>
        <div role="alert" class="failure">{{ moreFailure() }}</div>
        @if (next()) {
          <button matButton type="button" class="more" [disabled]="loadingMore()" (click)="loadMore()">Cargar más</button>
        }
      }
    }
  `,
  styles: `
    h1 {
      margin: 0 0 8px;
      font: var(--mat-sys-headline-small);
    }

    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 8px;
    }

    .filters mat-form-field {
      flex: 1 1 160px;
    }

    .product {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 8px;
      margin: 0 0 8px;
    }

    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .more {
      margin-top: 8px;
    }

    .failure {
      color: var(--mat-sys-error);
    }

    .failure:empty {
      display: none;
    }
  `,
})
export class AuditLog {
  readonly tenantId = input.required<string>();
  /** Los filtros, de la dirección (`?actor=…&product=…&type=…&from=aaaa-mm-dd&to=aaaa-mm-dd`). */
  readonly actor = input<string>();
  readonly product = input<string>();
  readonly type = input<string>();
  readonly from = input<string>();
  readonly to = input<string>();

  private readonly audit = inject(AUDIT_QUERIES);
  private readonly team = inject(TEAM_QUERIES);
  private readonly catalog = inject(CATALOG_QUERIES);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly access = inject(CURRENT_ACCESS);

  protected readonly types = TYPES;
  protected readonly id = computed(() => tenantId(this.tenantId()));
  protected readonly isOwner = computed(() => this.access()?.isOwner === true);

  protected readonly filter = computed<AuditFilter>(() => {
    const [type, from, to] = [TYPES.find((t) => t.value === this.type())?.value, parseDay(this.from()), parseDay(this.to())];
    const [actor, product] = [this.actor(), this.product()];
    return {
      ...(actor ? { actorUid: actor } : {}),
      ...(product ? { productId: productId(product) } : {}),
      ...(type ? { type } : {}),
      ...(from ? { from } : {}),
      // "Hasta" incluye el día elegido entero.
      ...(to ? { to: nextDay(to) } : {}),
    };
  });
  protected readonly filtered = computed(() => Object.keys(this.filter()).length > 0);
  protected readonly invalidRange = computed(() => {
    const { from, to } = this.filter();
    return from !== undefined && to !== undefined && from >= to;
  });

  /** No es en tiempo real: es una investigación, y una lista que se mueve sola confunde. */
  protected readonly firstPage = resource({
    params: () => (this.isOwner() && !this.invalidRange() ? { tenantId: this.id(), filter: this.filter() } : undefined),
    loader: ({ params }) => this.audit.listEntries(params.tenantId, params.filter, { limit: PAGE_SIZE }),
  });
  /** Las páginas siguientes; con otros filtros se empieza de nuevo. */
  private readonly more = linkedSignal<AuditPage | undefined, AuditPage[]>({ source: this.firstPage.value, computation: () => [] });
  protected readonly entries = computed(() => [...(this.firstPage.value()?.entries ?? []), ...this.more().flatMap((page) => page.entries)]);
  protected readonly next = computed(() => (this.more().at(-1) ?? this.firstPage.value())?.next ?? null);
  protected readonly loadingMore = signal(false);
  protected readonly moreFailure = signal('');

  private readonly members = liveResource<readonly Membership[], TenantId>({
    params: () => (this.isOwner() ? this.id() : undefined),
    subscribe: (id, watcher) => this.team.watchMembers(id, watcher),
  });
  protected readonly people = computed(() =>
    this.members.hasValue() ? [...this.members.value()].sort((a, b) => a.displayName.localeCompare(b.displayName)) : [],
  );

  /** Cada producto se lee una vez por visita, aunque aparezca en muchas entradas. */
  private readonly subjectCache = new Map<ProductId, Promise<Subject>>();
  private readonly productIds = computed(() => {
    const ids = new Set(this.entries().flatMap((entry) => (entry.entity.productId ? [entry.entity.productId] : [])));
    const filtered = this.filter().productId;
    if (filtered) ids.add(filtered);
    return [...ids].sort();
  });
  private readonly subjects = resource({
    params: () => (this.productIds().length > 0 ? { tenantId: this.id(), ids: this.productIds() } : undefined),
    loader: async ({ params }) => new Map(await Promise.all(params.ids.map(async (id) => [id, await this.subjectOf(params.tenantId, id)] as const))),
  });

  protected readonly names = computed<EntryNames>(() => {
    const people = new Map(this.people().map((person) => [person.uid as string, person.displayName]));
    const subjects = this.subjects.hasValue() ? this.subjects.value() : undefined;
    return {
      person: (uid) => people.get(uid),
      variant: (product, variant) => {
        const subject = subjects?.get(product);
        if (!subject) return undefined;
        return `${subject.name} · ${subject.variants.get(variant as VariantId) ?? 'variante archivada'}`;
      },
    };
  });
  protected readonly productName = computed(() => {
    const id = this.filter().productId;
    const subject = id && this.subjects.hasValue() ? this.subjects.value().get(id) : undefined;
    return subject?.name ?? 'cargando…';
  });

  protected setFilter(key: FilterKey, value: string): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { [key]: value || null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected clearFilters(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }

  protected async loadMore(): Promise<void> {
    const after = this.next();
    const base = this.firstPage.value();
    if (!after || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.moreFailure.set('');
    try {
      const page = await this.audit.listEntries(this.id(), this.filter(), { limit: PAGE_SIZE, after });
      // Si mientras tanto cambiaron los filtros, esta página ya no corresponde.
      if (this.firstPage.value() === base) this.more.update((pages) => [...pages, page]);
    } catch {
      this.moreFailure.set('No pudimos cargar más entradas. Reintentá.');
    } finally {
      this.loadingMore.set(false);
    }
  }

  private subjectOf(tenant: TenantId, id: ProductId): Promise<Subject> {
    let subject = this.subjectCache.get(id);
    if (!subject) {
      subject = Promise.all([
        firstValue<Product | null>((watcher) => this.catalog.watchProduct(tenant, id, watcher)),
        firstValue<readonly Variant[]>((watcher) => this.catalog.watchVariants(tenant, id, watcher)),
      ])
        .then(([product, variants]): Subject =>
          product ? { name: product.name, variants: new Map(variants.map((v) => [v.id, combinationLabel(product.options, v.optionValues)])) } : null,
        )
        // Sin nombre, la entrada igual se muestra: dice "una variante" en vez de fallar entera.
        .catch((): Subject => null);
      this.subjectCache.set(id, subject);
    }
    return subject;
  }
}

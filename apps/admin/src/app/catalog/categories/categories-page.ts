import { LiveAnnouncer } from '@angular/cdk/a11y';
import { CdkDrag, CdkDropList, CdkDropListGroup, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  childrenOf,
  depthOf,
  effectiveVisibility,
  firstFreeCategorySlug,
  MAX_CATEGORY_DEPTH,
  slugify,
  tenantId,
  type CategoryId,
  type CategoryNode,
  type CategoryTree,
  type TenantId,
} from '@ecommerce/domain';
import { EmptyState, ErrorState, Skeleton } from '@ecommerce/ui';
import { CATALOG_COMMANDS, CATALOG_QUERIES } from '../../core/client';
import { liveResource } from '../../shared/live-resource';
import { trackUnsaved } from '../../shared/pending-changes/pending-changes';
import { CURRENT_ACCESS, injectCan } from '../../tenant/current-access';
import { canMoveInto, categoryErrorMessage, inTreeOrder, moveAndAnnounce, pathLabel } from './category-messages';
import { CategoryRow } from './category-row';

type VisibilityFilter = 'all' | 'visible' | 'hidden';

/** Lo que se está escribiendo para crear una categoría. `parentId` vacío es el primer nivel. */
interface NewCategory {
  name: string;
  parentId: string;
  slug: string;
}

const EMPTY: NewCategory = { name: '', parentId: '', slug: '' };

/**
 * El árbol de categorías del comercio (Historia 2 de la 002). Se lee entero de un documento; la
 * visibilidad efectiva de cada una se deriva en memoria, y cada fila dice si está oculta por sí misma
 * o por su categoría padre (FR-021a). Sin `catalog.write` se ve y se filtra, sin acciones.
 */
@Component({
  selector: 'app-categories-page',
  imports: [
    NgTemplateOutlet,
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    MatButton,
    MatFormField,
    MatLabel,
    MatHint,
    MatInput,
    Skeleton,
    ErrorState,
    EmptyState,
    CategoryRow,
  ],
  templateUrl: './categories-page.html',
  styleUrl: './categories-page.scss',
})
export class CategoriesPage {
  readonly tenantId = input.required<string>();

  private readonly queries = inject(CATALOG_QUERIES);
  private readonly commands = inject(CATALOG_COMMANDS);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly canWrite = injectCan('catalog.write');
  private readonly access = inject(CURRENT_ACCESS);

  protected readonly id = computed<TenantId>(() => tenantId(this.tenantId()));
  protected readonly tree = liveResource<CategoryTree, TenantId>({
    params: () => this.id(),
    subscribe: (id, watcher) => this.queries.watchCategoryTree(id, watcher),
  });
  protected readonly current = computed(() => (this.tree.hasValue() ? this.tree.value() : undefined));
  /**
   * El árbol se muestra cuando además se sabe qué puede hacer la cuenta: el alta y las acciones
   * dependen de eso, y si aparecieran después empujarían la vista (como en el editor de producto).
   */
  protected readonly ready = computed(() => (this.access() === undefined ? undefined : this.current()));
  protected readonly visibility = computed(() => effectiveVisibility(this.current() ?? { nodes: {}, pendingPrune: [] }));
  protected readonly empty = computed(() => Object.keys(this.current()?.nodes ?? {}).length === 0);

  protected readonly filter = signal<VisibilityFilter>('all');
  /** La vista filtrada es una lista con la ruta de cada una: una oculta puede estar bajo una visible. */
  protected readonly filtered = computed(() => {
    const tree = this.current();
    const filter = this.filter();
    if (!tree || filter === 'all') return [];
    return inTreeOrder(tree).filter((node) => this.visibility().get(node.id)?.visible === (filter === 'visible'));
  });

  protected readonly failure = signal('');

  // ── Crear ─────────────────────────────────────────────────────────────────────────────────────

  protected readonly draft = signal<NewCategory>(EMPTY);
  /** Se conserva entre reintentos: si la primera llegó al servidor, no se crea dos veces. */
  private requestId = crypto.randomUUID();
  protected readonly creating = signal(false);
  protected readonly createFailure = signal('');

  /** Donde puede ir una nueva: en el primer nivel o dentro de una de los dos primeros (FR-019). */
  protected readonly parents = computed(() => {
    const tree = this.current();
    if (!tree) return [];
    return inTreeOrder(tree)
      .filter((node) => depthOf(tree, node.id) < MAX_CATEGORY_DEPTH)
      .map((node) => ({ value: node.id as string, label: pathLabel(tree, node.id) }));
  });

  /** La URL que va a recibir, antes de confirmar (FR-021): la escrita, o la generada con su sufijo. */
  protected readonly slugPreview = computed<{ text: string; ok: boolean } | null>(() => {
    const tree = this.current();
    const { name, slug } = this.draft();
    if (!tree || (name.trim() === '' && slug.trim() === '')) return null;
    if (slug.trim() === '') return { text: `Su URL será …/${firstFreeCategorySlug(tree, name)}`, ok: true };
    const written = slugify(slug);
    if (!written) return { text: 'La URL necesita al menos una letra o un número.', ok: false };
    const taken = Object.values(tree.nodes).some((node) => node.slug === written || node.previousSlugs.includes(written));
    return taken ? { text: 'La usa otra categoría, o está reservada.', ok: false } : { text: `Su URL será …/${written}`, ok: true };
  });

  protected readonly canCreate = computed(() => this.draft().name.trim() !== '' && this.slugPreview()?.ok === true && !this.creating());

  constructor() {
    trackUnsaved(() => this.draft().name.trim() !== '' || this.draft().slug.trim() !== '');
  }

  protected children(parentId: CategoryId | null): CategoryNode[] {
    const tree = this.current();
    return tree ? childrenOf(tree, parentId) : [];
  }

  protected edit(field: keyof NewCategory, value: string): void {
    this.draft.update((draft) => ({ ...draft, [field]: value }));
  }

  protected async create(): Promise<void> {
    if (!this.canCreate()) return;
    const { name, parentId, slug } = this.draft();
    this.creating.set(true);
    this.createFailure.set('');
    const result = await this.commands.createCategory(this.id(), {
      parentId: (parentId || null) as CategoryId | null,
      name: name.trim(),
      ...(slug.trim() === '' ? {} : { slug: slug.trim() }),
      requestId: this.requestId,
    });
    this.creating.set(false);
    if (!result.ok) {
      this.createFailure.set(categoryErrorMessage(result));
      return;
    }
    this.snackBar.open(`Creaste «${name.trim()}» en …/${result.data.slug}`, undefined, { duration: 4000 });
    this.requestId = crypto.randomUUID();
    this.draft.set(EMPTY);
  }

  // ── Arrastrar ─────────────────────────────────────────────────────────────────────────────────

  /** Una lista acepta lo arrastrado solo si podría quedar ahí (FR-019); el servidor lo verifica igual. */
  protected readonly canEnter = (drag: CdkDrag<CategoryId>, drop: CdkDropList<CategoryId | null>): boolean => {
    const tree = this.current();
    return !!tree && canMoveInto(tree, drag.data, drop.data);
  };

  protected async dropped(event: CdkDragDrop<CategoryId | null, CategoryId | null, CategoryId>): Promise<void> {
    const tree = this.current();
    const parentId = event.container.data;
    if (!tree || (event.previousContainer.data === parentId && event.previousIndex === event.currentIndex)) return;
    this.failure.set('');
    const failed = await moveAndAnnounce({ commands: this.commands, announcer: this.announcer }, this.id(), tree, {
      categoryId: event.item.data,
      parentId,
      position: event.currentIndex,
    });
    if (failed) this.failure.set(categoryErrorMessage(failed));
  }

  protected path(node: CategoryNode): string {
    const tree = this.current();
    return tree ? pathLabel(tree, node.id) : node.name;
  }
}

import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatChip, MatChipRemove, MatChipSet } from '@angular/material/chips';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  effectiveVisibility,
  MAX_CATEGORIES_PER_PRODUCT,
  resolveCategories,
  type CategoryId,
  type CategoryTree,
  type Product,
  type TenantId,
} from '@ecommerce/domain';
import { CATALOG_COMMANDS } from '../../../core/client';
import { commandErrorMessage } from '../../../shared/command-errors';
import { trackUnsaved } from '../../../shared/pending-changes/pending-changes';
import { injectCan } from '../../../tenant/current-access';
import { inTreeOrder, pathLabel } from '../../categories/category-messages';

/**
 * Las categorías de un producto (FR-022): hasta 20, de cualquier nivel, cada una con su ruta. Lo que
 * se elige queda como intención —agregar esta, quitar aquella— sobre lo que llega del servidor, y se
 * manda así: nunca el conjunto completo, que pisaría una asignación masiva hecha al mismo tiempo
 * (research §2 de la 002).
 */
@Component({
  selector: 'app-categories-section',
  imports: [MatButton, MatChipSet, MatChip, MatChipRemove],
  template: `
    <h2 id="categorias">Categorías</h2>
    <p class="count">{{ shown().length }} de {{ max }}</p>
    @if (shown().length === 0) {
      <p class="none">Sin categorías.</p>
    } @else {
      <mat-chip-set aria-label="Categorías del producto">
        @for (id of shown(); track id) {
          <mat-chip [removable]="canWrite()">
            <span class="chip-label">{{ label(id) }}</span>
            @if (canWrite()) {
              <button matChipRemove type="button" [attr.aria-label]="'Quitar «' + path(id) + '»'" (click)="remove(id)">✕</button>
            }
          </mat-chip>
        }
      </mat-chip-set>
    }
    @if (canWrite()) {
      @if (shown().length >= max) {
        <p class="note">Llegaste al tope de {{ max }} categorías: quitá una para agregar otra.</p>
      } @else {
        <div class="add">
          <div class="select">
            <label for="add-category">Agregar categoría</label>
            <select id="add-category" data-field="addCategory" [value]="choice()" (change)="choice.set($any($event.target).value)">
              <option value="">Elegí una</option>
              @for (option of available(); track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </div>
          <button matButton type="button" [disabled]="choice() === ''" (click)="add()">Agregar</button>
        </div>
      }
      <div role="alert" class="failure">{{ failure() }}</div>
      @if (dirty()) {
        <div class="actions">
          <button matButton type="button" (click)="discard()">Descartar</button>
          <button matButton="filled" type="button" [disabled]="saving()" (click)="save()">Guardar categorías</button>
        </div>
      }
    }
  `,
  styles: `
    h2 {
      margin: 0 0 4px;
      font: var(--mat-sys-title-large);
    }

    .count,
    .none,
    .note {
      margin: 0 0 8px;
      color: var(--mat-sys-on-surface-variant);
    }

    mat-chip-set {
      display: block;
      margin-bottom: 8px;
    }

    .add {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 8px;
    }

    /* Sin min-width: 0, el selector toma el ancho de su ruta más larga y desborda a 360 px. */
    .select {
      display: flex;
      flex: 1 1 220px;
      flex-direction: column;
      min-width: 0;
      gap: 4px;
      font: var(--mat-sys-body-medium);
    }

    .select select {
      min-height: 48px;
      max-width: 100%;
      font: inherit;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
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
export class CategoriesSection {
  readonly tenantId = input.required<TenantId>();
  readonly product = input.required<Product>();
  /** Lo lee el editor, que espera a tenerlo antes de mostrarse: los chips no aparecen después. */
  readonly tree = input.required<CategoryTree>();

  protected readonly max = MAX_CATEGORIES_PER_PRODUCT;

  private readonly commands = inject(CATALOG_COMMANDS);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly canWrite = injectCan('catalog.write');

  private readonly visibility = computed(() => effectiveVisibility(this.tree()));

  /** Las intenciones de quien edita, sobre lo que llegue del servidor. */
  private readonly added = signal<readonly CategoryId[]>([]);
  private readonly removed = signal<readonly CategoryId[]>([]);
  protected readonly choice = signal('');
  protected readonly saving = signal(false);
  protected readonly failure = signal('');

  /** Las vigentes del producto (sin las eliminadas), menos las que se quitan, más las que se agregan. */
  protected readonly shown = computed(() => {
    const stored = resolveCategories(this.tree(), this.product().categoryIds).filter((id) => !this.removed().includes(id));
    return [...new Set([...stored, ...this.added()])];
  });
  protected readonly dirty = computed(() => this.added().length > 0 || this.removed().length > 0);

  protected readonly available = computed(() => {
    const tree = this.tree();
    const shown = new Set(this.shown());
    return inTreeOrder(tree)
      .filter((node) => !shown.has(node.id))
      .map((node) => ({ value: node.id as string, label: pathLabel(tree, node.id) }));
  });

  constructor() {
    trackUnsaved(() => this.dirty());
  }

  protected path(id: CategoryId): string {
    return pathLabel(this.tree(), id);
  }

  protected label(id: CategoryId): string {
    return this.visibility().get(id)?.visible === false ? `${this.path(id)} · oculta` : this.path(id);
  }

  protected add(): void {
    const id = this.choice() as CategoryId;
    if (!id) return;
    this.choice.set('');
    if (this.removed().includes(id)) this.removed.update((list) => list.filter((other) => other !== id));
    else this.added.update((list) => [...list, id]);
  }

  protected remove(id: CategoryId): void {
    if (this.added().includes(id)) this.added.update((list) => list.filter((other) => other !== id));
    else this.removed.update((list) => [...list, id]);
  }

  protected discard(): void {
    this.added.set([]);
    this.removed.set([]);
    this.failure.set('');
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.failure.set('');
    const result = await this.commands.setProductCategories(this.tenantId(), {
      productId: this.product().id,
      add: [...this.added()],
      remove: [...this.removed()],
    });
    this.saving.set(false);
    if (!result.ok) {
      this.failure.set(commandErrorMessage(result.code));
      return;
    }
    this.discard();
    this.snackBar.open('Categorías guardadas', undefined, { duration: 3000 });
  }
}

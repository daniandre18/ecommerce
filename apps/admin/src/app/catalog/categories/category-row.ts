import { LiveAnnouncer } from '@angular/cdk/a11y';
import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { CommandFailure } from '@ecommerce/application';
import { childrenOf, descendantsOf, slugify, type CategoryId, type CategoryNode, type CategoryTree, type EffectiveVisibility, type TenantId } from '@ecommerce/domain';
import { CATALOG_COMMANDS, CATALOG_QUERIES } from '../../core/client';
import { trackUnsaved } from '../../shared/pending-changes/pending-changes';
import { injectCan } from '../../tenant/current-access';
import { canMoveInto, categoryErrorMessage, inTreeOrder, moveAndAnnounce, pathLabel } from './category-messages';

type Mode = 'idle' | 'rename' | 'slug' | 'move' | 'hide' | 'delete' | 'delete-blocked';

/**
 * Una categoría del árbol, con sus acciones en un menú y cada una en su panel, debajo de la fila.
 * Todo lo que el arrastre hace tiene su camino por teclado: subir, bajar y mover a otra.
 */
@Component({
  selector: 'app-category-row',
  imports: [CdkDragHandle, MatButton, MatFormField, MatLabel, MatInput, MatMenu, MatMenuItem, MatMenuTrigger],
  template: `
    <div class="line">
      @if (canWrite() && draggable()) {
        <span cdkDragHandle class="handle" aria-hidden="true" title="Arrastrar para mover">⠿</span>
      }
      <div class="info">
        <span class="category-name">{{ node().name }}</span>
        @if (path()) {
          <span class="category-path">{{ path() }}</span>
        }
        <span class="category-slug">…/{{ node().slug }}</span>
        @if (stateLabel()) {
          <span class="category-state">{{ stateLabel() }}</span>
        }
      </div>
      @if (canWrite()) {
        <button matButton type="button" class="actions" [matMenuTriggerFor]="menu" [attr.aria-label]="'Acciones de «' + node().name + '»'">Acciones</button>
        <mat-menu #menu="matMenu">
          <button mat-menu-item type="button" (click)="start('rename')">Renombrar</button>
          <button mat-menu-item type="button" (click)="start('slug')">Cambiar URL</button>
          <!-- Sigue la visibilidad PROPIA: la de una oculta solo por su padre es visible (FR-021a). -->
          <button mat-menu-item type="button" (click)="toggleHidden()">{{ node().hidden ? 'Mostrar' : 'Ocultar' }}</button>
          <button mat-menu-item type="button" (click)="start('move')">Mover a…</button>
          @if (index() > 0) {
            <button mat-menu-item type="button" (click)="shift(-1)">Subir</button>
          }
          @if (index() < siblings().length - 1) {
            <button mat-menu-item type="button" (click)="shift(1)">Bajar</button>
          }
          <button mat-menu-item type="button" (click)="startDelete()">Eliminar</button>
        </mat-menu>
      }
    </div>

    @switch (mode()) {
      @case ('rename') {
        <form class="panel" novalidate (submit)="$event.preventDefault(); rename()">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>Nombre</mat-label>
            <input matInput data-field="rename" autocomplete="off" [value]="draft()" (input)="draft.set($any($event.target).value)" />
          </mat-form-field>
          <p class="note">La URL no cambia: los enlaces que ya la usan siguen funcionando.</p>
          <div class="buttons">
            <button matButton type="button" (click)="cancel()">Cancelar</button>
            <button matButton="filled" type="submit" [disabled]="busy() || draft().trim() === '' || draft().trim() === node().name">Guardar</button>
          </div>
        </form>
      }
      @case ('slug') {
        <form class="panel" novalidate (submit)="$event.preventDefault(); saveSlug()">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>URL</mat-label>
            <input matInput data-field="slug" autocomplete="off" [value]="draft()" (input)="draft.set($any($event.target).value)" />
          </mat-form-field>
          <p class="note" aria-live="polite">{{ slugStatus().text }}</p>
          <div class="buttons">
            <button matButton type="button" (click)="cancel()">Cancelar</button>
            <button matButton="filled" type="submit" [disabled]="busy() || !slugStatus().canSave">Guardar</button>
          </div>
        </form>
      }
      @case ('move') {
        <form class="panel" novalidate (submit)="$event.preventDefault(); moveTo()">
          <div class="select">
            <label [for]="'destination-' + node().id">Mover a</label>
            <select [id]="'destination-' + node().id" data-field="destination" [value]="destination()" (change)="destination.set($any($event.target).value)">
              @for (option of destinations(); track option.value) {
                <option [value]="option.value">{{ option.label }}</option>
              }
            </select>
          </div>
          <div class="buttons">
            <button matButton type="button" (click)="cancel()">Cancelar</button>
            <button matButton="filled" type="submit" [disabled]="busy() || destinations().length === 0">Mover</button>
          </div>
        </form>
      }
      @case ('hide') {
        <div class="panel confirm">
          <p>{{ hideWarning() }}</p>
          <p class="note">Cada una conserva su propia visibilidad: al volver a mostrar «{{ node().name }}», vuelven como estaban.</p>
          <div class="buttons">
            <button matButton type="button" (click)="cancel()">Cancelar</button>
            <button matButton="filled" type="button" [disabled]="busy()" (click)="setHidden(true)">Ocultar</button>
          </div>
        </div>
      }
      @case ('delete-blocked') {
        <div class="panel confirm">
          <p>Primero mové o eliminá sus subcategorías.</p>
          <div class="buttons">
            <button matButton type="button" (click)="cancel()">Entendido</button>
          </div>
        </div>
      }
      @case ('delete') {
        <div class="panel confirm">
          <p aria-live="polite">{{ deleteWarning() }}</p>
          <div class="buttons">
            <button matButton type="button" (click)="cancel()">Cancelar</button>
            <button matButton="filled" type="button" [disabled]="busy() || affected() === null" (click)="remove()">Eliminar</button>
          </div>
        </div>
      }
    }
    <div role="alert" class="failure">{{ failure() }}</div>
  `,
  styles: `
    :host {
      display: block;
    }

    .line {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 56px;
    }

    .handle {
      cursor: grab;
      padding: 12px 4px;
      color: var(--mat-sys-on-surface-variant);
    }

    .info {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
    }

    .category-name {
      font: var(--mat-sys-title-small);
      overflow-wrap: anywhere;
    }

    .category-path,
    .category-slug {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      overflow-wrap: anywhere;
    }

    .category-state {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }

    .panel {
      margin: 0 0 12px;
      padding: 12px 16px;
      border-radius: 12px;
      background: var(--mat-sys-surface-container);
    }

    .panel mat-form-field {
      display: block;
    }

    .panel p {
      margin: 0 0 8px;
    }

    .note {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }

    .select {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 8px;
    }

    .select select {
      min-height: 48px;
      max-width: 100%;
      font: inherit;
    }

    .buttons {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }

    .failure {
      color: var(--mat-sys-error);
    }

    .failure:empty {
      display: none;
    }
  `,
})
export class CategoryRow {
  readonly tenantId = input.required<TenantId>();
  readonly tree = input.required<CategoryTree>();
  readonly node = input.required<CategoryNode>();
  readonly visibility = input<EffectiveVisibility>({ visible: true });
  /** En la vista filtrada, la ruta completa; en el árbol, la da el anidamiento. */
  readonly path = input<string | null>(null);
  /** Solo en el árbol: en la vista filtrada no hay listas donde soltarla. */
  readonly draggable = input(false);

  private readonly commands = inject(CATALOG_COMMANDS);
  private readonly queries = inject(CATALOG_QUERIES);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly canWrite = injectCan('catalog.write');

  protected readonly mode = signal<Mode>('idle');
  protected readonly draft = signal('');
  protected readonly destination = signal('');
  protected readonly affected = signal<number | null>(null);
  protected readonly busy = signal(false);
  protected readonly failure = signal('');

  protected readonly siblings = computed(() => childrenOf(this.tree(), this.node().parentId));
  protected readonly index = computed(() => this.siblings().findIndex((sibling) => sibling.id === this.node().id));
  private readonly descendants = computed(() => descendantsOf(this.tree(), this.node().id));

  protected readonly stateLabel = computed(() => {
    const visibility = this.visibility();
    if (visibility.visible) return '';
    if (visibility.hiddenBy === 'self') return 'Oculta';
    return `Oculta por su categoría padre (${this.tree().nodes[visibility.ancestorId]?.name ?? ''})`;
  });

  protected readonly hideWarning = computed(() => {
    const n = this.descendants().length;
    return n === 1 ? 'También queda oculta en la tienda su subcategoría.' : `También quedan ocultas en la tienda sus ${n} subcategorías.`;
  });

  protected readonly deleteWarning = computed(() => {
    const n = this.affected();
    const name = this.node().name;
    if (n === null) return 'Contando sus productos…';
    if (n === 0) return `Ningún producto está en «${name}».`;
    const who = n === 1 ? '1 producto dejará' : `${n.toLocaleString('es')} productos dejarán`;
    return `${who} de estar en «${name}»; no se modifican de ninguna otra forma.`;
  });

  /** A dónde puede ir: ni su rama, ni donde ya está, ni a más de tres niveles con sus hijas. */
  protected readonly destinations = computed(() => {
    const tree = this.tree();
    const node = this.node();
    const options = node.parentId === null ? [] : [{ value: '', label: 'Al primer nivel' }];
    for (const candidate of inTreeOrder(tree)) {
      if (candidate.id !== node.parentId && canMoveInto(tree, node.id, candidate.id)) {
        options.push({ value: candidate.id, label: pathLabel(tree, candidate.id) });
      }
    }
    return options;
  });

  /** Qué dice la URL que se está escribiendo, contra el árbol que ya está en memoria (FR-021). */
  protected readonly slugStatus = computed(() => {
    const node = this.node();
    const next = slugify(this.draft());
    if (!next) return { text: 'La URL necesita al menos una letra o un número.', canSave: false };
    if (next === node.slug) return { text: 'Es la URL vigente.', canSave: false };
    if (node.previousSlugs.includes(next)) return { text: 'Era una URL anterior de esta categoría: se recupera.', canSave: true };
    const taken = Object.values(this.tree().nodes).some((other) => other.id !== node.id && (other.slug === next || other.previousSlugs.includes(next)));
    return taken ? { text: 'La usa otra categoría, o está reservada.', canSave: false } : { text: `Quedará …/${next}`, canSave: true };
  });

  constructor() {
    trackUnsaved(() => {
      const mode = this.mode();
      if (mode === 'rename') return this.draft().trim() !== this.node().name;
      if (mode === 'slug') return this.draft().trim() !== this.node().slug;
      return false;
    });
  }

  protected start(mode: 'rename' | 'slug' | 'move'): void {
    this.failure.set('');
    if (mode === 'rename') this.draft.set(this.node().name);
    if (mode === 'slug') this.draft.set(this.node().slug);
    if (mode === 'move') this.destination.set(this.destinations()[0]?.value ?? '');
    this.mode.set(mode);
  }

  protected cancel(): void {
    this.mode.set('idle');
    this.failure.set('');
  }

  protected toggleHidden(): void {
    this.failure.set('');
    if (this.node().hidden) {
      void this.setHidden(false);
    } else if (this.descendants().length > 0) {
      this.mode.set('hide');
    } else {
      void this.setHidden(true);
    }
  }

  /** Una sola orden, para esta categoría: sus descendientes conservan cada uno la suya (FR-021a). */
  protected async setHidden(hidden: boolean): Promise<void> {
    await this.run(() => this.commands.setCategoryHidden(this.tenantId(), { categoryId: this.node().id, hidden }));
  }

  protected async rename(): Promise<void> {
    await this.run(() => this.commands.renameCategory(this.tenantId(), { categoryId: this.node().id, name: this.draft().trim() }));
  }

  protected async saveSlug(): Promise<void> {
    if (!this.slugStatus().canSave) return;
    await this.run(() => this.commands.setCategorySlug(this.tenantId(), { categoryId: this.node().id, slug: this.draft().trim() }));
  }

  protected async shift(by: -1 | 1): Promise<void> {
    await this.move(this.node().parentId, this.index() + by);
  }

  protected async moveTo(): Promise<void> {
    const parentId = (this.destination() || null) as CategoryId | null;
    await this.move(parentId, childrenOf(this.tree(), parentId).length);
  }

  protected async startDelete(): Promise<void> {
    this.failure.set('');
    if (this.descendants().length > 0) {
      this.mode.set('delete-blocked');
      return;
    }
    this.affected.set(null);
    this.mode.set('delete');
    try {
      this.affected.set(await this.queries.countInCategory(this.tenantId(), this.node().id));
    } catch {
      this.failure.set('No pudimos contar sus productos. Reintentá.');
    }
  }

  protected async remove(): Promise<void> {
    const name = this.node().name;
    const done = await this.run(() => this.commands.deleteCategory(this.tenantId(), { categoryId: this.node().id }));
    if (done) this.snackBar.open(`Eliminaste «${name}»`, undefined, { duration: 3000 });
  }

  private async move(parentId: CategoryId | null, position: number): Promise<void> {
    this.busy.set(true);
    this.failure.set('');
    const failed = await moveAndAnnounce(
      { commands: this.commands, announcer: this.announcer },
      this.tenantId(),
      this.tree(),
      { categoryId: this.node().id, parentId, position },
    );
    this.busy.set(false);
    if (failed) this.failure.set(categoryErrorMessage(failed));
    else this.mode.set('idle');
  }

  private async run(command: () => Promise<{ ok: true } | CommandFailure>): Promise<boolean> {
    this.busy.set(true);
    this.failure.set('');
    const result = await command();
    this.busy.set(false);
    if (!result.ok) {
      this.failure.set(categoryErrorMessage(result));
      return false;
    }
    this.mode.set('idle');
    return true;
  }
}

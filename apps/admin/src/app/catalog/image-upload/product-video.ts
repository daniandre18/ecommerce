import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { parseVideoUrl, type Product, type TenantId, type VideoProvider } from '@ecommerce/domain';
import { CATALOG_COMMANDS } from '../../core/client';
import { commandErrorMessage } from '../../shared/command-errors';
import { trackUnsaved } from '../../shared/pending-changes/pending-changes';
import { injectCan } from '../../tenant/current-access';

const PROVIDERS: Record<VideoProvider, string> = { youtube: 'YouTube', vimeo: 'Vimeo' };
const WATCH: Record<VideoProvider, (id: string) => string> = {
  youtube: (id) => `https://www.youtube.com/watch?v=${id}`,
  vimeo: (id) => `https://vimeo.com/${id}`,
};

/**
 * El video externo del producto (FR-018): un enlace de YouTube o de Vimeo, ubicado entre las
 * imágenes. Es solo del producto; las variantes tienen sus imágenes y nada más.
 */
@Component({
  selector: 'app-product-video',
  imports: [MatFormField, MatLabel, MatHint, MatInput, MatButton],
  template: `
    <h3>Video</h3>
    @if (product().video; as video) {
      <p class="current">
        Video de {{ providerName(video.provider) }}, {{ positionLabel(video.position) }} ·
        <a [href]="watchUrl(video.provider, video.videoId)" target="_blank" rel="noopener noreferrer">Verlo</a>
      </p>
      @if (canWrite()) {
        <button matButton type="button" (click)="remove()">Quitar video</button>
      }
    } @else if (!canWrite()) {
      <p class="none">Sin video.</p>
    }
    @if (canWrite()) {
      <form novalidate (submit)="$event.preventDefault(); save()">
        <mat-form-field>
          <mat-label>{{ product().video ? 'Reemplazar por otro enlace' : 'Enlace de YouTube o Vimeo' }}</mat-label>
          <input matInput data-field="videoUrl" type="url" autocomplete="off" [value]="url()" (input)="url.set($any($event.target).value)" />
          <mat-hint>Pegá el enlace del video; se muestra junto a las imágenes.</mat-hint>
        </mat-form-field>
        <label class="position">
          Ubicación
          <select [value]="position()" (change)="position.set(+$any($event.target).value)">
            @for (option of positions(); track option.value) {
              <option [value]="option.value">{{ option.label }}</option>
            }
          </select>
        </label>
        <div role="alert" class="failure">{{ problem() ?? failure() }}</div>
        <div class="actions">
          <button matButton="filled" type="submit" [disabled]="!canSave()">Guardar video</button>
        </div>
      </form>
    }
  `,
  styles: `
    h3 {
      margin: 16px 0 8px;
      font: var(--mat-sys-title-medium);
    }

    mat-form-field {
      display: block;
    }

    .position {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 8px;
      font: var(--mat-sys-body-medium);
    }

    .position select {
      min-height: 48px;
      max-width: 100%;
      font: inherit;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
    }

    .failure {
      color: var(--mat-sys-error);
    }

    .failure:empty {
      display: none;
    }
  `,
})
export class ProductVideo {
  readonly tenantId = input.required<TenantId>();
  readonly product = input.required<Product>();

  private readonly commands = inject(CATALOG_COMMANDS);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly canWrite = injectCan('catalog.write');

  protected readonly url = signal('');
  protected readonly position = signal(0);
  protected readonly failure = signal('');

  /** Antes de la primera imagen, o después de cualquiera de ellas. */
  protected readonly positions = computed(() => [
    { value: 0, label: 'Antes de la primera imagen' },
    ...this.product().images.map((_, i) => ({ value: i + 1, label: `Después de la imagen ${i + 1}` })),
  ]);
  /** El mismo análisis que hace el servidor: el enlace se rechaza antes de enviarlo (FR-018). */
  protected readonly problem = computed(() =>
    this.url().trim() !== '' && !parseVideoUrl(this.url()) ? 'Solo se admiten videos de YouTube o Vimeo.' : null,
  );
  protected readonly canSave = computed(() => this.url().trim() !== '' && this.problem() === null);

  constructor() {
    trackUnsaved(() => this.url().trim() !== '');
  }

  protected providerName(provider: VideoProvider): string {
    return PROVIDERS[provider];
  }

  protected watchUrl(provider: VideoProvider, id: string): string {
    return WATCH[provider](id);
  }

  protected positionLabel(position: number): string {
    return position === 0 ? 'antes de la primera imagen' : `después de la imagen ${position}`;
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) return;
    await this.send({ url: this.url().trim(), position: this.position() }, 'Video guardado');
  }

  protected async remove(): Promise<void> {
    await this.send(null, 'Video quitado');
  }

  private async send(video: { url: string; position: number } | null, done: string): Promise<void> {
    this.failure.set('');
    const product = this.product();
    const result = await this.commands.updateProductDetails(this.tenantId(), { productId: product.id, version: product.version, video });
    if (result.ok) {
      this.url.set('');
      this.snackBar.open(done, undefined, { duration: 3000 });
    } else {
      this.failure.set(commandErrorMessage(result.code));
    }
  }
}

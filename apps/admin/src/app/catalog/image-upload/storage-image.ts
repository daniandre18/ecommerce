import { Component, inject, input, resource } from '@angular/core';
import { IMAGE_STORAGE } from '../../core/client';

/**
 * Una imagen guardada en Storage. Ocupa siempre el mismo lugar —con o sin la imagen cargada—, así
 * nada salta cuando llega (SC-009). Si no se puede mostrar, queda su texto alternativo.
 */
@Component({
  selector: 'app-storage-image',
  template: `
    @if (url.hasValue()) {
      <img [src]="url.value()" [alt]="alt()" width="72" height="72" />
    } @else if (url.error()) {
      <span class="fallback">{{ alt() }}</span>
    } @else {
      <span class="placeholder" aria-hidden="true"></span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      width: 72px;
      height: 72px;
      flex: none;
      border-radius: 8px;
      overflow: hidden;
      background: var(--mat-sys-surface-container-high);
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .fallback {
      padding: 4px;
      font: var(--mat-sys-label-small);
      overflow: hidden;
    }
  `,
})
export class StorageImage {
  readonly storagePath = input.required<string>();
  readonly alt = input.required<string>();

  private readonly storage = inject(IMAGE_STORAGE);
  protected readonly url = resource({ params: () => this.storagePath(), loader: ({ params }) => this.storage.displayUrl(params) });
}

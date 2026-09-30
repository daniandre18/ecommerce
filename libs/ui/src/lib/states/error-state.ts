import { Component, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';

/**
 * Estado de error de una vista, con reintento (FR-037). Es un `alert`: se anuncia al aparecer sin
 * mover el foco (WCAG 4.1.3). Nunca se usa para "no hay resultados": eso es `ui-empty-state`.
 */
@Component({
  selector: 'ui-error-state',
  imports: [MatButton],
  host: { role: 'alert' },
  template: `
    <p class="heading">{{ heading() }}</p>
    @if (message(); as detail) {
      <p class="message">{{ detail }}</p>
    }
    <button matButton="outlined" type="button" (click)="retry.emit()">Reintentar</button>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      padding: 16px;
      border-radius: 12px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }

    .heading {
      margin: 0;
      font: var(--mat-sys-title-medium);
    }

    .message {
      margin: 0;
      font: var(--mat-sys-body-medium);
    }
  `,
})
export class ErrorState {
  /** "heading" y no "title": `title` choca con la propiedad del DOM y dispara un tooltip nativo. */
  readonly heading = input('No pudimos cargar esta información');
  readonly message = input<string>();
  readonly retry = output<void>();
}

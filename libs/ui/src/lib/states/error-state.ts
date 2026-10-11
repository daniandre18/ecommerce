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
    <!--
      Mientras reintenta, el botón lo dice y no acepta otro clic, pero conserva el foco: \`disabled\`
      se lo quitaría a quien lo acaba de activar. Con \`disabledInteractive\` el clic igual llega, y
      por eso lo descarta \`onRetry\`.
    -->
    <button matButton="outlined" type="button" [disabled]="retrying()" disabledInteractive (click)="onRetry()">
      {{ retrying() ? 'Reintentando…' : 'Reintentar' }}
    </button>
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
  /**
   * La vista está volviendo a cargar. Al recargar, `resource` conserva el error anterior hasta que
   * llega el resultado nuevo: sin esta señal, el estado de error no cambiaba, y sin red eso duraba los
   * 10 s de `OFFLINE_AFTER_MS` (hallazgo de T001 de la 003). Se le pasa `status() === 'reloading'` de
   * los recursos que reintenta, no `isLoading()`: un recurso en su carga inicial no está reintentando,
   * y con `isLoading()` un error de uno mientras otro todavía carga bloqueaba el reintento.
   */
  readonly retrying = input(false);
  readonly retry = output<void>();

  protected onRetry(): void {
    if (!this.retrying()) this.retry.emit();
  }
}

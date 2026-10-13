import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Component, effect, inject, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';

/**
 * Estado de error de una vista, con reintento (FR-037). Es un `alert`: se anuncia al aparecer sin
 * mover el foco (WCAG 4.1.3). Nunca se usa para "no hay resultados": eso es `ui-empty-state`.
 */
@Component({
  selector: 'ui-error-state',
  imports: [MatButton],
  // El fondo, el texto, el relleno y el radio son los del aviso de error del sistema (`.ds-notice--error`).
  host: { role: 'alert', class: 'ds-notice ds-notice--error' },
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
      gap: var(--ds-space-2);
    }

    .heading {
      margin: 0;
      font: var(--ds-type-subtitle);
    }

    .message {
      margin: 0;
      font: var(--ds-type-body);
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

  private readonly announcer = inject(LiveAnnouncer);

  constructor() {
    // El `alert` se anunció al aparecer, y reintentar no cambia su contenido: sin esto, un lector de
    // pantalla no se enteraba ni de que empezó ni de que volvió a fallar (T057 de la 003). Si el
    // reintento sale bien, la vista reemplaza al estado de error y el anuncio es el de la vista.
    let previous = false;
    effect(() => {
      const retrying = this.retrying();
      if (retrying && !previous) void this.announcer.announce('Reintentando…');
      if (!retrying && previous) void this.announcer.announce(`${this.heading()}. Puedes volver a intentarlo.`, 'assertive');
      previous = retrying;
    });
  }

  protected onRetry(): void {
    if (!this.retrying()) this.retry.emit();
  }
}

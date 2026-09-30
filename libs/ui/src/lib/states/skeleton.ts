import { Component, computed, input, numberAttribute } from '@angular/core';

/**
 * Esqueleto de carga para listas y tablas (FR-036). Reserva el espacio del contenido final
 * —`rowHeight` debe ser la altura de la fila real— para que nada salte cuando llegan los datos.
 *
 * Accesibilidad: el anfitrión es un `status` que anuncia `label` una sola vez; las filas son
 * decorativas y quedan ocultas a la tecnología asistiva.
 */
@Component({
  selector: 'ui-skeleton',
  host: { role: 'status', 'aria-busy': 'true' },
  template: `
    <span class="cdk-visually-hidden">{{ label() }}</span>
    @for (row of rowIndexes(); track row) {
      <div class="skeleton-row" aria-hidden="true" [style.height]="rowHeight()"></div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .skeleton-row {
      border-radius: 8px;
      background: linear-gradient(
        90deg,
        var(--mat-sys-surface-container-high) 25%,
        var(--mat-sys-surface-container-highest) 50%,
        var(--mat-sys-surface-container-high) 75%
      );
      background-size: 200% 100%;
      animation: shimmer 1.4s ease-in-out infinite;
    }

    @keyframes shimmer {
      from { background-position: 200% 0; }
      to { background-position: -200% 0; }
    }
  `,
})
export class Skeleton {
  readonly rows = input(3, { transform: numberAttribute });
  readonly rowHeight = input('48px');
  readonly label = input('Cargando…');

  protected readonly rowIndexes = computed(() => {
    const count = Math.max(1, Math.floor(this.rows()) || 1);
    return Array.from({ length: count }, (_, index) => index);
  });
}

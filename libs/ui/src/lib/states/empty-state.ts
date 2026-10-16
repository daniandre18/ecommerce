import { Component, input } from '@angular/core';

/**
 * Estado de vacío (FR-037). Un vacío no es un error: es un `status`, anunciado con cortesía.
 *
 * La acción de creación la aporta la vista como contenido proyectado, porque "cuando corresponda"
 * depende de ella y puede ser un botón o un enlace de navegación.
 */
@Component({
  selector: 'ui-empty-state',
  host: { role: 'status' },
  template: `
    <p class="heading">{{ heading() }}</p>
    @if (message(); as detail) {
      <p class="message">{{ detail }}</p>
    }
    <ng-content />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--ds-space-2);
      padding: var(--ds-space-8) var(--ds-space-4);
      text-align: center;
      color: var(--ds-text-secondary);
    }

    .heading {
      margin: 0;
      font: var(--ds-type-subtitle);
      color: var(--ds-text-primary);
    }

    .message {
      margin: 0;
      font: var(--ds-type-body);
    }
  `,
})
export class EmptyState {
  readonly heading = input.required<string>();
  readonly message = input<string>();
}

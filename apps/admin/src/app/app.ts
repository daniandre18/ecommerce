import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationError, Router, RouterOutlet } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { NavigationFailure } from './shared/navigation-failure';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    <!--
      Al arrancar, Angular reemplaza la estructura estática de index.html. Hasta que la primera vista
      esté lista —sesión, código de la ruta— se dibuja la misma, para que entre una y otra no quede la
      pantalla en blanco (SC-009). Usa los estilos de index.html, superpuesta: la vista se arma debajo
      en su lugar definitivo, y al quitarla no se mueve nada (SC-012).
    -->
    @if (booting()) {
      <div class="boot" aria-busy="true">
        <p class="boot-header">Cargando el panel…</p>
        <div class="boot-row"></div>
        <div class="boot-row"></div>
        <div class="boot-row"></div>
        <div class="boot-row"></div>
      </div>
    }
    <a class="skip-link" href="#contenido">Saltar al contenido</a>
    <main id="contenido" tabindex="-1">
      @if (navigation.failedUrl(); as url) {
        <div role="alert" class="navigation-failure">
          No pudimos abrir esa vista. Revisá tu conexión.
          <button type="button" (click)="navigation.retry(url)">Reintentar</button>
        </div>
      }
      <router-outlet />
    </main>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      min-height: 100dvh;
    }

    .boot {
      position: absolute;
      inset: 0;
      z-index: 1;
      background: var(--mat-sys-surface);
    }

    main {
      padding: 16px;
      max-width: 1200px;
      margin-inline: auto;
    }

    main:focus {
      outline: none;
    }

    /* Visible solo al recibir el foco del teclado (WCAG 2.4.1). */
    .skip-link {
      position: absolute;
      inset-inline-start: 8px;
      inset-block-start: -48px;
      padding: 8px 16px;
      background: var(--mat-sys-inverse-surface);
      color: var(--mat-sys-inverse-on-surface);
      border-radius: 4px;
      z-index: 10;
    }

    .skip-link:focus {
      inset-block-start: 8px;
    }

    .navigation-failure {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 16px;
      margin-bottom: 16px;
      padding: 12px 16px;
      border-radius: 12px;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }

    .navigation-failure button {
      min-height: 48px;
      padding-inline: 16px;
      border: 1px solid currentColor;
      border-radius: 24px;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
  `,
})
export class App {
  protected readonly navigation = inject(NavigationFailure);
  /** Hasta que termina la primera navegación. Una redirección —a `/login`, por ejemplo— no la termina. */
  protected readonly booting = toSignal(
    inject(Router).events.pipe(
      filter((event) => event instanceof NavigationEnd || event instanceof NavigationError),
      take(1),
      map(() => false),
    ),
    { initialValue: true },
  );
}

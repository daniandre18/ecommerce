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
          No pudimos abrir esa vista. Revisa tu conexión.
          <button type="button" (click)="navigation.retry(url)">Reintentar</button>
        </div>
      }
      <router-outlet />
    </main>
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

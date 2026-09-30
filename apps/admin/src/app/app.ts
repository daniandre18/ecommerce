import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    <a class="skip-link" href="#contenido">Saltar al contenido</a>
    <main id="contenido" tabindex="-1">
      <router-outlet />
    </main>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
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
  `,
})
export class App {}

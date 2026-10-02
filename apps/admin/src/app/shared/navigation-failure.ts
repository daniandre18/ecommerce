import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, Router, type NavigationError } from '@angular/router';

/**
 * Una vista que no se pudo abrir —sin red, su código no se descarga— no queda en silencio (FR-037):
 * la raíz lo avisa y ofrece reintentar. Sin Material: el aviso tiene que poder mostrarse justo
 * cuando no se puede descargar nada más.
 */
@Injectable({ providedIn: 'root' })
export class NavigationFailure {
  /** La dirección que no se pudo abrir, hasta que una navegación termine bien. */
  readonly failedUrl = signal<string | undefined>(undefined);
  private readonly document = inject(DOCUMENT);

  constructor() {
    inject(Router).events.subscribe((event) => {
      if (event instanceof NavigationEnd) this.failedUrl.set(undefined);
    });
  }

  /**
   * Recarga la página en esa dirección. Navegar de nuevo con el router no alcanza: el navegador
   * recuerda que la descarga de ese código falló y la vuelve a rechazar aunque ya haya red.
   */
  retry(url: string): void {
    this.document.location.assign(url);
  }
}

/** Para `withNavigationErrorHandler`: corre en un contexto de inyección. */
export function rememberNavigationFailure(error: NavigationError): void {
  inject(NavigationFailure).failedUrl.set(error.url);
}

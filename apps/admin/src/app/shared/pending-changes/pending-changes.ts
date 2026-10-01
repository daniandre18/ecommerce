import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, inject, Injectable, Injector, signal } from '@angular/core';
import type { CanDeactivateFn } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { ConfirmData } from '../confirm-dialog';

/**
 * Lo escrito y todavía sin guardar en las vistas abiertas (T094, FR-039). Un guardado que falla ya
 * conserva lo escrito y deja reintentar; lo que faltaba era no perderlo al irse: salir de la vista
 * pregunta antes, y cerrar o recargar la pestaña también.
 */
@Injectable({ providedIn: 'root' })
export class PendingChanges {
  private readonly sources = signal<ReadonlySet<() => boolean>>(new Set());
  /** ¿Hay algo sin guardar en alguna parte? */
  readonly any = computed(() => [...this.sources()].some((unsaved) => unsaved()));

  constructor() {
    inject(DOCUMENT).defaultView?.addEventListener('beforeunload', (event) => {
      if (this.any()) event.preventDefault();
    });
  }

  /** Cuenta lo sin guardar de quien llama mientras siga vivo. */
  register(unsaved: () => boolean, destroyRef: DestroyRef): void {
    this.sources.update((sources) => new Set(sources).add(unsaved));
    destroyRef.onDestroy(() =>
      this.sources.update((sources) => {
        const rest = new Set(sources);
        rest.delete(unsaved);
        return rest;
      }),
    );
  }
}

/** En el inicializador de un componente: `trackUnsaved(() => this.dirty())`. */
export function trackUnsaved(unsaved: () => boolean): void {
  inject(PendingChanges).register(unsaved, inject(DestroyRef));
}

/**
 * Guarda de salida: con algo sin guardar, se pregunta antes de irse (FR-039). El diálogo se carga
 * recién cuando hace falta: la guarda está en la configuración de rutas, que va en la carga inicial.
 */
export const confirmUnsaved: CanDeactivateFn<unknown> = async () => {
  const pending = inject(PendingChanges);
  const injector = inject(Injector);
  if (!pending.any()) return true;
  const [{ MatDialog }, { ConfirmDialog }] = await Promise.all([import('@angular/material/dialog'), import('../confirm-dialog')]);
  const data: ConfirmData = {
    title: 'Hay cambios sin guardar',
    message: 'Si salís ahora, lo que escribiste y no se guardó se pierde.',
    confirm: 'Salir sin guardar',
  };
  const ref = injector.get(MatDialog).open<InstanceType<typeof ConfirmDialog>, ConfirmData, boolean>(ConfirmDialog, { data });
  return (await firstValueFrom(ref.afterClosed())) === true;
};

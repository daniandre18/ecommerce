import { DOCUMENT, Injectable, inject } from '@angular/core';
import { SESSION } from '../core/client';

/**
 * Cierra la sesión y recarga el panel. La recarga no es estética: la caché local de Firestore no se
 * separa por cuenta, y sin ella la cuenta siguiente en este navegador podría ver por un instante lo
 * que leyó la anterior.
 */
@Injectable({ providedIn: 'root' })
export class SignOut {
  private readonly session = inject(SESSION);
  private readonly location = inject(DOCUMENT).location;

  async run(): Promise<void> {
    await this.session.signOut();
    this.location.assign('/login');
  }
}

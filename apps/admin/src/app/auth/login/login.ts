import { Component, inject, input, signal } from '@angular/core';
import { email, form, FormField, required, submit } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import type { SignInFailure } from '@ecommerce/application/client';
import { SESSION } from '../../core/client';

const SIGN_IN_FAILURES: Record<SignInFailure, string> = {
  'invalid-credentials': 'El correo o la contraseña no son correctos.',
  'too-many-attempts': 'Hubo demasiados intentos. Esperá unos minutos y volvé a probar.',
  unavailable: 'No pudimos conectarnos. Revisá tu red y reintentá.',
};

@Component({
  selector: 'app-login',
  imports: [FormField, MatFormField, MatLabel, MatError, MatInput, MatButton, RouterLink],
  template: `
    <h1>Iniciar sesión</h1>
    <form class="ds-card" novalidate (submit)="$event.preventDefault(); signIn()">
      <mat-form-field>
        <mat-label>Correo</mat-label>
        <input matInput type="email" autocomplete="username" [formField]="loginForm.email" />
        @if (loginForm.email().errors()[0]; as error) {
          <mat-error>{{ error.message }}</mat-error>
        }
      </mat-form-field>

      <mat-form-field>
        <mat-label>Contraseña</mat-label>
        <input matInput type="password" autocomplete="current-password" [formField]="loginForm.password" />
        @if (loginForm.password().errors()[0]; as error) {
          <mat-error>{{ error.message }}</mat-error>
        }
      </mat-form-field>

      <div role="alert" class="failure">{{ failure() }}</div>

      <button matButton="filled" class="ds-primary-action" type="submit" [disabled]="loginForm().submitting()">Entrar</button>
    </form>
    <!-- Quien llega por una invitación y todavía no tiene cuenta la crea acá, y vuelve al enlace. -->
    <p class="other">¿No tenés cuenta? <a routerLink="/signup" [queryParams]="{ returnUrl: returnUrl() }">Creá una</a></p>
  `,
  styles: `
    :host {
      display: block;
      max-width: 400px;
      margin: var(--ds-space-12) auto;
    }

    h1 {
      margin: 0 0 var(--ds-space-6);
      font: var(--ds-type-page-title);
      letter-spacing: var(--ds-type-page-title-tracking);
    }

    /* Fuera del comercio hay dos planos, página y tarjeta: el formulario es la tarjeta (SC-005). */
    form {
      display: flex;
      flex-direction: column;
      gap: var(--ds-space-2);
    }

    .failure:empty {
      display: none;
    }

    .failure {
      color: var(--ds-status-error);
      font: var(--ds-type-body);
    }

    .other {
      margin-top: var(--ds-space-4);
      font: var(--ds-type-body);
    }
  `,
})
export class Login {
  /** Adónde volver al entrar. Llega en la query string, puesta por la guarda de sesión. */
  readonly returnUrl = input<string>();

  private readonly session = inject(SESSION);
  private readonly router = inject(Router);

  protected readonly credentials = signal({ email: '', password: '' });
  protected readonly loginForm = form(this.credentials, (path) => {
    required(path.email, { message: 'Ingresá tu correo' });
    email(path.email, { message: 'Ese correo no parece válido' });
    required(path.password, { message: 'Ingresá tu contraseña' });
  });
  /** El contenedor del aviso existe siempre: un `alert` agregado de golpe no siempre se anuncia. */
  protected readonly failure = signal('');

  protected signIn(): void {
    void submit(this.loginForm, async () => {
      this.failure.set('');
      const { email: address, password } = this.credentials();
      const result = await this.session.signIn(address, password);
      if (result.ok) {
        await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
      } else {
        this.failure.set(SIGN_IN_FAILURES[result.reason]);
      }
      return undefined;
    });
  }
}

/** Solo rutas internas: un `returnUrl` armado por otro no puede sacar a la persona del panel. */
export function safeReturnUrl(url: string | undefined): string {
  if (!url?.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) return '/';
  return url;
}

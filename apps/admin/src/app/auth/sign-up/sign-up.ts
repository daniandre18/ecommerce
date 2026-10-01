import { Component, inject, input, signal } from '@angular/core';
import { email, form, FormField, minLength, required, submit } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import type { SignUpFailure } from '@ecommerce/application';
import { SESSION } from '../../core/client';
import { safeReturnUrl } from '../login/login';

const SIGN_UP_FAILURES: Record<SignUpFailure, string> = {
  'email-in-use': 'Ya hay una cuenta con ese correo. Iniciá sesión con ella.',
  'invalid-email': 'Ese correo no parece válido.',
  'weak-password': 'Esa contraseña es muy fácil de adivinar. Probá con otra más larga.',
  'too-many-attempts': 'Hubo demasiados intentos. Esperá unos minutos y volvé a probar.',
  unavailable: 'No pudimos conectarnos. Revisá tu red y reintentá.',
};

/**
 * Crear una cuenta. Se llega desde una invitación: el comercio lo da la invitación, no esta pantalla
 * (FR-005, FR-007). Con la cuenta creada, la sesión queda abierta y se vuelve al enlace.
 */
@Component({
  selector: 'app-sign-up',
  imports: [FormField, MatFormField, MatLabel, MatHint, MatError, MatInput, MatButton, RouterLink],
  template: `
    <h1>Crear cuenta</h1>
    <form novalidate (submit)="$event.preventDefault(); signUp()">
      <mat-form-field>
        <mat-label>Tu nombre</mat-label>
        <input matInput autocomplete="name" [formField]="signUpForm.displayName" />
        <mat-hint>Así te ve el equipo y así quedan firmados tus cambios.</mat-hint>
        @if (signUpForm.displayName().errors()[0]; as error) {
          <mat-error>{{ error.message }}</mat-error>
        }
      </mat-form-field>

      <mat-form-field>
        <mat-label>Correo</mat-label>
        <input matInput type="email" autocomplete="username" [formField]="signUpForm.email" />
        <mat-hint>El mismo al que te llegó la invitación.</mat-hint>
        @if (signUpForm.email().errors()[0]; as error) {
          <mat-error>{{ error.message }}</mat-error>
        }
      </mat-form-field>

      <mat-form-field>
        <mat-label>Contraseña</mat-label>
        <input matInput type="password" autocomplete="new-password" [formField]="signUpForm.password" />
        @if (signUpForm.password().errors()[0]; as error) {
          <mat-error>{{ error.message }}</mat-error>
        }
      </mat-form-field>

      <div role="alert" class="failure">{{ failure() }}</div>

      <button matButton="filled" type="submit" [disabled]="signUpForm().submitting()">Crear cuenta</button>
    </form>
    <p class="other">¿Ya tenés cuenta? <a routerLink="/login" [queryParams]="{ returnUrl: returnUrl() }">Iniciá sesión</a></p>
  `,
  styles: `
    :host {
      display: block;
      max-width: 400px;
      margin: 48px auto;
    }

    form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .failure:empty {
      display: none;
    }

    .failure {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-medium);
    }

    .other {
      margin-top: 16px;
      font: var(--mat-sys-body-medium);
    }
  `,
})
export class SignUp {
  /** Adónde volver con la cuenta creada: el enlace de la invitación. */
  readonly returnUrl = input<string>();

  private readonly session = inject(SESSION);
  private readonly router = inject(Router);

  protected readonly account = signal({ displayName: '', email: '', password: '' });
  protected readonly signUpForm = form(this.account, (path) => {
    required(path.displayName, { message: 'Escribí tu nombre' });
    required(path.email, { message: 'Ingresá tu correo' });
    email(path.email, { message: 'Ese correo no parece válido' });
    required(path.password, { message: 'Elegí una contraseña' });
    minLength(path.password, 6, { message: 'Usá al menos 6 caracteres' });
  });
  protected readonly failure = signal('');

  protected signUp(): void {
    void submit(this.signUpForm, async () => {
      this.failure.set('');
      const { displayName, email: address, password } = this.account();
      const result = await this.session.signUp({ email: address.trim(), password, displayName: displayName.trim() });
      if (result.ok) {
        await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
      } else {
        this.failure.set(SIGN_UP_FAILURES[result.reason]);
      }
      return undefined;
    });
  }
}

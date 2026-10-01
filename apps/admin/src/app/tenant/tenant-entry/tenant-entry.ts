import { Component, inject, signal } from '@angular/core';
import { form, FormField, required, submit, validate } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { Router } from '@angular/router';
import { isSingleSegment } from '@ecommerce/domain';
import { SignOut } from '../../auth/sign-out';

/**
 * Entrada a un comercio por su código. Es lo mínimo de la Historia 1, que trabaja con un solo
 * comercio: elegirlo de la lista de membresías de la cuenta llega con el selector (T075).
 */
@Component({
  selector: 'app-tenant-entry',
  imports: [FormField, MatFormField, MatLabel, MatHint, MatError, MatInput, MatButton],
  template: `
    <h1>Tu comercio</h1>
    <form novalidate (submit)="$event.preventDefault(); open()">
      <mat-form-field>
        <mat-label>Código del comercio</mat-label>
        <input matInput autocomplete="off" [formField]="entryForm.code" />
        <mat-hint>Es el que aparece en el enlace de tu panel: /t/código</mat-hint>
        @if (entryForm.code().errors()[0]; as error) {
          <mat-error>{{ error.message }}</mat-error>
        }
      </mat-form-field>
      <button matButton="filled" type="submit">Abrir el catálogo</button>
    </form>
    <button matButton type="button" (click)="signOut.run()">Cerrar sesión</button>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 400px;
      margin: 48px auto;
    }

    form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
  `,
})
export class TenantEntry {
  private readonly router = inject(Router);
  protected readonly signOut = inject(SignOut);

  protected readonly entry = signal({ code: '' });
  protected readonly entryForm = form(this.entry, (path) => {
    required(path.code, { message: 'Ingresá el código de tu comercio' });
    validate(path.code, ({ value }) => {
      const code = value().trim();
      return code === '' || isSingleSegment(code) ? undefined : { kind: 'segment', message: 'Ese código no es válido' };
    });
  });

  protected open(): void {
    void submit(this.entryForm, async () => {
      await this.router.navigate(['/t', this.entry().code.trim(), 'catalog']);
      return undefined;
    });
  }
}

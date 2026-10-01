import { Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import type { Role, RoleId } from '@ecommerce/domain';

export interface TransferOwnershipData {
  readonly name: string;
  /** Los roles que puede quedarse quien hoy es Propietario. */
  readonly roles: readonly Role[];
}

/**
 * Traspasar la propiedad (FR-011): el comercio sigue con exactamente un Propietario, y quien lo era
 * elige con qué rol se queda. Devuelve ese rol, o nada si se cancela.
 */
@Component({
  selector: 'app-transfer-ownership-dialog',
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose, MatButton, MatFormField, MatLabel, MatInput],
  template: `
    <h2 mat-dialog-title>¿Hacer Propietario a {{ data.name }}?</h2>
    <mat-dialog-content>
      <p>Va a poder todo en este comercio, incluido administrar el equipo. Vos dejás de ser Propietario y te quedás con el rol que elijas.</p>
      <mat-form-field>
        <mat-label>Tu rol desde ahora</mat-label>
        <select matNativeControl (change)="choose($any($event.target).value)">
          @for (role of data.roles; track role.id) {
            <option [value]="role.id" [selected]="role.id === roleId()">{{ role.name }}</option>
          }
        </select>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" [mat-dialog-close]="undefined">Cancelar</button>
      <button matButton="filled" type="button" [mat-dialog-close]="roleId()">Traspasar la propiedad</button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-form-field {
      display: block;
    }
  `,
})
export class TransferOwnershipDialog {
  protected readonly data = inject<TransferOwnershipData>(MAT_DIALOG_DATA);
  protected readonly roleId = signal<RoleId | undefined>(this.data.roles[0]?.id);

  protected choose(id: string): void {
    this.roleId.set(this.data.roles.find((role) => role.id === id)?.id);
  }
}

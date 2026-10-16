import { Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle } from '@angular/material/dialog';

export interface ConfirmData {
  readonly title: string;
  readonly message: string;
  /** El verbo de la acción, no "Aceptar": quien lee el botón sabe qué va a pasar. */
  readonly confirm: string;
}

/**
 * Confirmación de una acción con consecuencias. Devuelve `true` solo si se confirma.
 *
 * Todo lo que confirma es destructivo (archiva, elimina, da de baja o descarta), así que el botón lleva
 * el color destructivo y nunca el acento (contracts/primary-actions.md de la 003). Una confirmación que
 * no destruya necesita otro diálogo, o un dato que lo diga.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose, MatButton],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" [mat-dialog-close]="false">Cancelar</button>
      <button matButton="filled" class="ds-destructive" type="button" [mat-dialog-close]="true">{{ data.confirm }}</button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);
}

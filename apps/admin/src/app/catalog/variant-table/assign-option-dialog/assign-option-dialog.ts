import { Component, inject, signal } from '@angular/core';
import { applyEach, form, FormField, required, submit } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { optionId, valueId, variantId, type Assignment, type VariationOption } from '@ecommerce/domain';

export interface AssignOptionData {
  /** Las variantes existentes con datos: las que no pueden quedar sin valor en la opción nueva. */
  readonly variants: readonly { readonly id: string; readonly label: string }[];
  /** Las opciones que se agregan. */
  readonly options: readonly VariationOption[];
}

interface Row {
  readonly variantId: string;
  readonly label: string;
  readonly choices: readonly { readonly optionId: string; readonly valueId: string }[];
}

/**
 * FR-024: al agregar una opción a un producto con variantes cargadas, cada una necesita su valor en
 * la opción nueva antes de confirmar. Así conservan SKU, importes, existencias e imágenes.
 */
@Component({
  selector: 'app-assign-option-dialog',
  imports: [FormField, MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose, MatFormField, MatLabel, MatError, MatInput, MatButton],
  template: `
    <h2 mat-dialog-title>¿Qué valor tiene cada variante?</h2>
    <form novalidate (submit)="$event.preventDefault(); confirm()">
      <mat-dialog-content>
        <p>
          Estas variantes ya tienen datos cargados. Elegí su valor en la opción nueva y conservan su SKU, sus importes, sus
          existencias y sus imágenes.
        </p>

        @for (option of data.options; track option.id) {
          <mat-form-field class="all">
            <mat-label>{{ option.name }}: aplicar a todas</mat-label>
            <select #all matNativeControl (change)="applyToAll(option.id, all.value)">
              <option value="">Elegí…</option>
              @for (value of option.values; track value.id) {
                <option [value]="value.id">{{ value.label }}</option>
              }
            </select>
          </mat-form-field>
        }

        @for (row of assignForm.rows; track $index; let rowIndex = $index) {
          <fieldset>
            <legend>{{ model().rows[rowIndex]?.label }}</legend>
            @for (choice of row.choices; track $index; let choiceIndex = $index) {
              <mat-form-field>
                <mat-label>{{ data.options[choiceIndex]?.name }}</mat-label>
                <select matNativeControl [formField]="choice.valueId">
                  <option value="">Elegí…</option>
                  @for (value of data.options[choiceIndex]?.values; track value.id) {
                    <option [value]="value.id">{{ value.label }}</option>
                  }
                </select>
                @if (choice.valueId().errors()[0]; as error) {
                  <mat-error>{{ error.message }}</mat-error>
                }
              </mat-form-field>
            }
          </fieldset>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancelar</button>
        <button matButton="filled" type="submit">Confirmar</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    fieldset {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      margin: 0 0 8px;
      padding: 8px 12px 0;
    }

    legend {
      font: var(--mat-sys-title-small);
    }

    mat-form-field {
      display: block;
    }
  `,
})
export class AssignOptionDialog {
  protected readonly data = inject<AssignOptionData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<AssignOptionDialog, Assignment[]>>(MatDialogRef);

  protected readonly model = signal<{ rows: Row[] }>({
    rows: this.data.variants.map((variant) => ({
      variantId: variant.id,
      label: variant.label,
      choices: this.data.options.map((option) => ({ optionId: option.id, valueId: '' })),
    })),
  });
  protected readonly assignForm = form(this.model, (path) => {
    applyEach(path.rows, (row) => {
      applyEach(row.choices, (choice) => {
        required(choice.valueId, { message: 'Elegí un valor' });
      });
    });
  });

  protected applyToAll(option: string, value: string): void {
    if (value === '') return;
    this.model.update(({ rows }) => ({
      rows: rows.map((row) => ({
        ...row,
        choices: row.choices.map((choice) => (choice.optionId === option ? { ...choice, valueId: value } : choice)),
      })),
    }));
  }

  protected confirm(): void {
    void submit(this.assignForm, async () => {
      const assignments = this.model().rows.flatMap((row) =>
        row.choices.map((choice) => ({ variantId: variantId(row.variantId), optionId: optionId(choice.optionId), valueId: valueId(choice.valueId) })),
      );
      this.dialogRef.close(assignments);
      return undefined;
    });
  }
}

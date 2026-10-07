import { Component, computed, inject, resource, signal } from '@angular/core';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { nextSlugCandidate, slugify, type ProductId, type Slug, type TenantId, type VariantId } from '@ecommerce/domain';
import { CATALOG_COMMANDS, CATALOG_QUERIES } from '../../core/client';
import { commandErrorMessage } from '../../shared/command-errors';

export interface CreateProductData {
  readonly tenantId: TenantId;
}

export interface CreatedProduct {
  readonly productId: ProductId;
  readonly variantId: VariantId;
  readonly name: string;
  /** La que asignó el servidor: puede no ser la de la vista previa si otro la tomó antes. */
  readonly slug: Slug | null;
}

/** Cuántas URL se prueban para la vista previa; el servidor sigue con un sufijo aleatorio. */
const PREVIEW_CANDIDATES = 20;

/** Nuevo producto: nace en borrador, con su variante implícita (FR-020). */
@Component({
  selector: 'app-create-product-dialog',
  imports: [
    FormField,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
    MatFormField,
    MatLabel,
    MatHint,
    MatError,
    MatInput,
    MatButton,
  ],
  template: `
    <h2 mat-dialog-title>Nuevo producto</h2>
    <form novalidate (submit)="$event.preventDefault(); create()">
      <mat-dialog-content>
        <mat-form-field>
          <mat-label>Nombre</mat-label>
          <input matInput [formField]="productForm.name" />
          @if (slugPreview(); as preview) {
            <mat-hint class="slug-preview" aria-live="polite">{{ preview }}</mat-hint>
          }
          @if (productForm.name().errors()[0]; as error) {
            <mat-error>{{ error.message }}</mat-error>
          }
        </mat-form-field>
        <mat-form-field>
          <mat-label>Descripción (opcional)</mat-label>
          <textarea matInput rows="3" [formField]="productForm.description"></textarea>
        </mat-form-field>
        <div role="alert" class="failure">{{ failure() }}</div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancelar</button>
        <button matButton="filled" type="submit" [disabled]="productForm().submitting()">Crear</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-form-field {
      display: block;
    }

    .failure:empty {
      display: none;
    }

    .failure {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-medium);
    }
  `,
})
export class CreateProductDialog {
  private readonly data = inject<CreateProductData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<CreateProductDialog, CreatedProduct>>(MatDialogRef);
  private readonly commands = inject(CATALOG_COMMANDS);
  private readonly queries = inject(CATALOG_QUERIES);

  /** Uno por diálogo: si un intento llegó al servidor pero la respuesta se perdió, el reintento no duplica. */
  private readonly requestId = crypto.randomUUID();

  protected readonly draft = signal({ name: '', description: '' });
  protected readonly productForm = form(this.draft, (path) => {
    required(path.name, { message: 'Ingresá un nombre' });
  });
  protected readonly failure = signal('');

  /** La URL que corresponde al nombre escrito, antes de buscar si está libre (FR-006). */
  private readonly base = computed(() => slugify(this.draft().name));
  /**
   * La primera libre, como la va a elegir el servidor: la base o el menor sufijo libre. Es una vista
   * previa; si otra creación la toma antes, el servidor asigna la siguiente y lo dice al cerrar.
   */
  private readonly firstFree = resource({
    params: () => {
      const base = this.base();
      return base ? { tenantId: this.data.tenantId, base } : undefined;
    },
    loader: async ({ params }) => {
      for (let n = 1; n <= PREVIEW_CANDIDATES; n++) {
        const candidate = nextSlugCandidate(params.base, n);
        if (!(await this.queries.findSlug(params.tenantId, candidate))) return candidate;
      }
      return null;
    },
  });
  protected readonly slugPreview = computed(() => {
    if (this.draft().name.trim() === '') return null;
    if (!this.base()) return 'Se generará una URL provisoria, para que la reemplaces por una que describa el producto.';
    if (!this.firstFree.hasValue()) return 'Buscando su URL…';
    const free = this.firstFree.value();
    return free ? `Su URL será …/${free}` : 'Su URL llevará un sufijo para no repetir otra.';
  });

  protected create(): void {
    void submit(this.productForm, async () => {
      this.failure.set('');
      const { name, description } = this.draft();
      const result = await this.commands.createProduct(this.data.tenantId, { requestId: this.requestId, name, description });
      if (result.ok) {
        this.dialogRef.close({ ...result.data, name });
      } else {
        this.failure.set(commandErrorMessage(result.code));
      }
      return undefined;
    });
  }
}

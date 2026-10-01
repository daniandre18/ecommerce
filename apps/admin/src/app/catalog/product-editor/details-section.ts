import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { form, FormField, readonly, submit, validate } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { Product, TenantId } from '@ecommerce/domain';
import { CATALOG_COMMANDS } from '../../core/client';
import { commandErrorMessage } from '../../shared/command-errors';
import { keepUnsaved } from '../../shared/keep-unsaved';
import { trackUnsaved } from '../../shared/pending-changes/pending-changes';
import { injectCan } from '../../tenant/current-access';

interface Details {
  name: string;
  description: string;
}

const detailsOf = (product: Product): Details => ({ name: product.name, description: product.description });

/** Nombre y descripción del producto. Sin `catalog.write` se leen pero no se editan (T079). */
@Component({
  selector: 'app-details-section',
  imports: [FormField, MatFormField, MatLabel, MatError, MatInput, MatButton],
  template: `
    <h2 id="datos">Datos</h2>
    <form novalidate (submit)="$event.preventDefault(); save()">
      <mat-form-field>
        <mat-label>Nombre</mat-label>
        <input matInput autocomplete="off" [formField]="detailsForm.name" />
        @if (detailsForm.name().errors()[0]; as error) {
          <mat-error>{{ error.message }}</mat-error>
        }
      </mat-form-field>
      <mat-form-field>
        <mat-label>Descripción</mat-label>
        <textarea matInput rows="3" [formField]="detailsForm.description"></textarea>
      </mat-form-field>
      <div role="alert" class="failure">{{ failure() }}</div>
      @if (dirty()) {
        <div class="actions">
          <button matButton type="button" (click)="discard()">Descartar cambios</button>
          <button matButton="filled" type="submit" [disabled]="detailsForm().submitting()">Guardar datos</button>
        </div>
      }
    </form>
  `,
  styles: `
    h2 {
      margin: 0 0 8px;
      font: var(--mat-sys-title-large);
    }

    mat-form-field {
      display: block;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .failure {
      color: var(--mat-sys-error);
    }

    .failure:empty {
      display: none;
    }
  `,
})
export class DetailsSection {
  readonly tenantId = input.required<TenantId>();
  readonly product = input.required<Product>();

  private readonly commands = inject(CATALOG_COMMANDS);
  private readonly snackBar = inject(MatSnackBar);
  private readonly canWrite = injectCan('catalog.write');

  private readonly stored = computed(() => detailsOf(this.product()));
  /** Lo escrito y sin guardar no se pisa cuando llega otra versión del producto. */
  protected readonly draft = linkedSignal<Details, Details>({
    source: this.stored,
    computation: keepUnsaved,
  });
  protected readonly detailsForm = form(this.draft, (path) => {
    readonly(path, { when: () => !this.canWrite() });
    validate(path.name, ({ value }) => (value().trim() === '' ? { kind: 'required', message: 'El producto necesita un nombre' } : undefined));
  });
  protected readonly dirty = computed(() => {
    const [draft, stored] = [this.draft(), this.stored()];
    return draft.name !== stored.name || draft.description !== stored.description;
  });
  protected readonly failure = signal('');

  constructor() {
    trackUnsaved(() => this.dirty());
  }

  protected discard(): void {
    this.draft.set(this.stored());
    this.failure.set('');
  }

  protected save(): void {
    this.failure.set('');
    void submit(this.detailsForm, async () => {
      const { name, description } = this.draft();
      const product = this.product();
      const result = await this.commands.updateProductDetails(this.tenantId(), { productId: product.id, version: product.version, name, description });
      if (result.ok) {
        this.snackBar.open('Datos guardados', undefined, { duration: 3000 });
      } else {
        this.failure.set(
          result.code === 'version-conflict'
            ? 'Alguien más editó el producto mientras lo tenías abierto. Descartá tus cambios para ver los actuales.'
            : commandErrorMessage(result.code),
        );
      }
      return undefined;
    });
  }
}

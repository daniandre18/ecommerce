import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MAX_MPN_LENGTH, type AgeGroup, type Gender, type Product, type TenantId } from '@ecommerce/domain';
import { CATALOG_COMMANDS } from '../../../core/client';
import { commandErrorMessage } from '../../../shared/command-errors';
import { keepUnsaved } from '../../../shared/keep-unsaved';
import { trackUnsaved } from '../../../shared/pending-changes/pending-changes';
import { injectCan } from '../../../tenant/current-access';

/** Cada rango de edad como su rango legible (FR-031); se guarda la taxonomía. */
const AGE_GROUP_LABELS: readonly (readonly [AgeGroup, string])[] = [
  ['newborn', '0 a 3 meses'],
  ['infant', '3 a 12 meses'],
  ['toddler', '1 a 5 años'],
  ['kids', '5 a 13 años'],
  ['adult', 'Adulto'],
];

const GENDER_LABELS: readonly (readonly [Gender, string])[] = [
  ['male', 'Masculino'],
  ['female', 'Femenino'],
  ['unisex', 'Unisex'],
];

/** Lo que se edita: vacío es "sin valor". */
interface Fields {
  mpn: string;
  ageGroup: AgeGroup | '';
  gender: Gender | '';
}

const fieldsOf = (product: Product): Fields => ({ mpn: product.mpn ?? '', ageGroup: product.ageGroup ?? '', gender: product.gender ?? '' });

/**
 * Los datos que piden los catálogos externos —comparadores, marketplaces, catálogos de anuncios—
 * (Historia 4 de la 002, FR-031): MPN, rango de edad y género, de listas cerradas.
 */
@Component({
  selector: 'app-external-catalogs-section',
  imports: [MatFormField, MatLabel, MatHint, MatInput, MatButton],
  template: `
    <h2 id="catalogos-externos">Catálogos externos</h2>
    <p class="note">Los piden los comparadores, los marketplaces y los catálogos de anuncios.</p>
    <div class="fields">
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>MPN (código del fabricante)</mat-label>
        <input matInput data-field="mpn" autocomplete="off" [readonly]="!canWrite()" [value]="draft().mpn" (input)="edit('mpn', $any($event.target).value)" />
        <mat-hint align="end" [class.over]="mpnTooLong()">{{ draft().mpn.trim().length }}/{{ maxMpn }}</mat-hint>
      </mat-form-field>
      <div class="select">
        <label for="age-group">Rango de edad</label>
        <!-- [selected] en cada opción: con [value] en el select, se fijaría antes de que existan las opciones. -->
        <select id="age-group" data-field="ageGroup" [disabled]="!canWrite()" (change)="edit('ageGroup', $any($event.target).value)">
          <option value="" [selected]="draft().ageGroup === ''">Sin rango de edad</option>
          @for (option of ageGroups; track option[0]) {
            <option [value]="option[0]" [selected]="draft().ageGroup === option[0]">{{ option[1] }}</option>
          }
        </select>
      </div>
      <div class="select">
        <label for="gender">Género</label>
        <select id="gender" data-field="gender" [disabled]="!canWrite()" (change)="edit('gender', $any($event.target).value)">
          <option value="" [selected]="draft().gender === ''">Sin género</option>
          @for (option of genders; track option[0]) {
            <option [value]="option[0]" [selected]="draft().gender === option[0]">{{ option[1] }}</option>
          }
        </select>
      </div>
    </div>
    @if (canWrite()) {
      <div role="alert" class="failure">{{ failure() }}</div>
      <div class="actions">
        <button matButton="filled" type="button" [disabled]="!dirty() || mpnTooLong() || saving()" (click)="save()">Guardar para catálogos externos</button>
      </div>
    }
  `,
  styles: `
    h2 {
      margin: 0 0 4px;
      font: var(--mat-sys-title-large);
    }

    .note {
      margin: 0 0 8px;
      color: var(--mat-sys-on-surface-variant);
    }

    .fields {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    /* Sin min-width: 0, un control flexible puede tomar el ancho de su contenido y desbordar. */
    .fields > * {
      flex: 1 1 200px;
      min-width: 0;
    }

    .select {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font: var(--mat-sys-body-medium);
    }

    .select select {
      min-height: 48px;
      max-width: 100%;
      font: inherit;
    }

    .over {
      color: var(--mat-sys-error);
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      margin-top: 8px;
    }

    .failure {
      color: var(--mat-sys-error);
    }

    .failure:empty {
      display: none;
    }
  `,
})
export class ExternalCatalogsSection {
  readonly tenantId = input.required<TenantId>();
  readonly product = input.required<Product>();

  protected readonly ageGroups = AGE_GROUP_LABELS;
  protected readonly genders = GENDER_LABELS;
  protected readonly maxMpn = MAX_MPN_LENGTH;

  private readonly commands = inject(CATALOG_COMMANDS);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly canWrite = injectCan('catalog.write');

  private readonly stored = computed(() => fieldsOf(this.product()));
  protected readonly draft = linkedSignal<Fields, Fields>({ source: this.stored, computation: keepUnsaved });
  protected readonly dirty = computed(() => (Object.keys(this.stored()) as (keyof Fields)[]).some((field) => this.changed(field)));
  protected readonly mpnTooLong = computed(() => this.draft().mpn.trim().length > MAX_MPN_LENGTH);
  protected readonly saving = signal(false);
  protected readonly failure = signal('');

  constructor() {
    trackUnsaved(() => this.dirty());
  }

  protected edit(field: keyof Fields, value: string): void {
    this.draft.update((draft) => ({ ...draft, [field]: value }));
  }

  /** Solo viaja lo que cambió; vacío viaja como `null`, que lo quita. */
  protected async save(): Promise<void> {
    const draft = this.draft();
    const product = this.product();
    const value = <F extends keyof Fields>(field: F) => (draft[field] === '' ? null : draft[field]);
    this.saving.set(true);
    this.failure.set('');
    const result = await this.commands.updateProductDetails(this.tenantId(), {
      productId: product.id,
      version: product.version,
      ...(this.changed('mpn') ? { mpn: draft.mpn.trim() === '' ? null : draft.mpn.trim() } : {}),
      ...(this.changed('ageGroup') ? { ageGroup: value('ageGroup') as AgeGroup | null } : {}),
      ...(this.changed('gender') ? { gender: value('gender') as Gender | null } : {}),
    });
    this.saving.set(false);
    if (!result.ok) {
      this.failure.set(commandErrorMessage(result.code));
      return;
    }
    this.snackBar.open('Datos para catálogos externos guardados', undefined, { duration: 3000 });
  }

  private changed(field: keyof Fields): boolean {
    const [draft, stored] = [this.draft()[field], this.stored()[field]];
    return field === 'mpn' ? draft.trim() !== stored : draft !== stored;
  }
}

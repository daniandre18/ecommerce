import { afterNextRender, Component, computed, ElementRef, inject, Injector, input, linkedSignal, signal } from '@angular/core';
import { applyEach, form, FormField, required, submit } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { CommandFailure } from '@ecommerce/application/client';
import {
  MAX_COMBINATIONS,
  MAX_OPTIONS,
  reconcileVariants,
  validateOptionLimits,
  variantId,
  type Assignment,
  type Product,
  type TenantId,
  type Variant,
  type VariationOption,
} from '@ecommerce/domain';
import { firstValueFrom } from 'rxjs';
import { CATALOG_COMMANDS } from '../../../core/client';
import { commandErrorMessage } from '../../../shared/command-errors';
import { trackUnsaved } from '../../../shared/pending-changes/pending-changes';
import { ConfirmDialog, type ConfirmData } from '../../../shared/confirm-dialog';
import { combinationLabel } from '../../shared/variant-labels';
import { AssignOptionDialog, type AssignOptionData } from '../../variant-table/assign-option-dialog/assign-option-dialog';
import {
  combinationCount,
  draftFrom,
  draftProblem,
  emptyOption,
  newId,
  sameDraft,
  toVariationOptions,
  type DraftOption,
  type OptionsDraft,
} from './option-draft';

/**
 * El editor de variaciones (T055, FR-017): opciones de a una, con nombre libre; valores que se
 * agregan, reordenan, renombran y quitan. Antes de enviar, el panel corre las mismas reglas del
 * dominio que el servidor: estructura, topes y la reconciliación que decide qué variantes se crean,
 * cuáles necesitan un valor nuevo (FR-024) y cuáles se archivan (FR-026).
 */
@Component({
  selector: 'app-options-editor',
  imports: [FormField, MatFormField, MatLabel, MatError, MatInput, MatButton],
  templateUrl: './options-editor.html',
  styleUrl: './options-editor.scss',
})
export class OptionsEditor {
  readonly tenantId = input.required<TenantId>();
  readonly product = input.required<Product>();
  readonly variants = input.required<readonly Variant[]>();

  private readonly commands = inject(CATALOG_COMMANDS);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly maxOptions = MAX_OPTIONS;

  /** Sigue a lo guardado mientras no haya cambios; con cambios sin guardar, no se pisa. */
  protected readonly draft = linkedSignal<OptionsDraft, OptionsDraft>({
    source: () => draftFrom(this.product().options),
    computation: (stored, previous) => (previous && !sameDraft(previous.value, previous.source) ? previous.value : stored),
  });
  protected readonly optionsForm = form(this.draft, (path) => {
    applyEach(path.options, (option) => {
      required(option.name, { message: 'Escribí el nombre de la opción' });
      applyEach(option.values, (value) => {
        required(value.label, { message: 'Escribí el valor' });
      });
    });
  });

  private readonly options = computed(() => toVariationOptions(this.draft()));
  protected readonly dirty = computed(() => !sameDraft(this.draft(), draftFrom(this.product().options)));
  protected readonly combinations = computed(() => combinationCount(this.options()));
  /** Los topes se avisan en vivo; el resto de los problemas, al intentar guardar. */
  protected readonly overLimit = computed(() => !validateOptionLimits(this.options()).ok || this.combinations() > MAX_COMBINATIONS);
  protected readonly failure = signal('');

  constructor() {
    trackUnsaved(() => this.dirty());
  }

  protected nameOf(option: DraftOption | undefined): string {
    return option?.name.trim() || 'la opción nueva';
  }

  protected labelOf(option: DraftOption | undefined, index: number): string {
    return option?.values[index]?.label.trim() || `valor ${index + 1}`;
  }

  protected addOption(): void {
    const option = emptyOption();
    this.update((options) => [...options, option]);
    this.focus(`opcion-${option.id}`);
  }

  protected removeOption(index: number): void {
    this.update((options) => options.filter((_, i) => i !== index));
  }

  protected addValue(index: number): void {
    const value = { id: newId(), label: '' };
    this.updateValues(index, (values) => [...values, value]);
    this.focus(`valor-${value.id}`);
  }

  protected removeValue(index: number, valueIndex: number): void {
    this.updateValues(index, (values) => values.filter((_, i) => i !== valueIndex));
  }

  protected moveValue(index: number, valueIndex: number, offset: -1 | 1): void {
    const value = this.draft().options[index]?.values[valueIndex];
    this.updateValues(index, (values) => {
      const target = valueIndex + offset;
      if (target < 0 || target >= values.length) return values;
      const reordered = [...values];
      const [moved] = reordered.splice(valueIndex, 1);
      if (moved) reordered.splice(target, 0, moved);
      return reordered;
    });
    // El foco sigue al valor que se movió, para poder seguir moviéndolo con el teclado.
    if (value) this.focus(`${offset < 0 ? 'subir' : 'bajar'}-${value.id}`);
  }

  protected discard(): void {
    this.draft.set(draftFrom(this.product().options));
    this.failure.set('');
  }

  protected save(): void {
    this.failure.set('');
    void submit(this.optionsForm, async () => {
      const options = this.options();
      const problem = draftProblem(options);
      if (problem) {
        this.failure.set(problem);
        return undefined;
      }
      await this.persist(options);
      return undefined;
    });
  }

  private async persist(options: VariationOption[]): Promise<void> {
    const product = this.product();
    const assignments = await this.askAssignments(options);
    if (!assignments) return;

    const outcome = this.preview(options, assignments);
    if (!outcome.ok) {
      this.failure.set('Falta asignar el valor nuevo a alguna variante');
      return;
    }
    const archived = outcome.value.archived.length;
    if (archived > 0 && !(await this.confirmArchive(archived))) return;

    const result = await this.commands.setProductOptions(this.tenantId(), { productId: product.id, version: product.version, options, assignments });
    if (result.ok) {
      const created = result.data.created.length;
      this.snackBar.open(created > 0 ? `Opciones guardadas: ${created} variantes nuevas` : 'Opciones guardadas', undefined, { duration: 4000 });
    } else {
      this.failure.set(failureMessage(result));
    }
  }

  /** FR-024: si alguna variante con datos necesita valor en una opción nueva, se le pide a la persona. */
  private async askAssignments(options: VariationOption[]): Promise<Assignment[] | undefined> {
    const preview = this.preview(options, []);
    if (preview.ok) return [];

    const product = this.product();
    const pending = new Set<string>(preview.error.variantIds);
    const data: AssignOptionData = {
      variants: this.variants()
        .filter((variant) => pending.has(variant.id))
        .map((variant) => ({ id: variant.id, label: combinationLabel(product.options, variant.optionValues) })),
      options: options.filter((option) => !product.options.some((existing) => existing.id === option.id)),
    };
    const ref = this.dialog.open<AssignOptionDialog, AssignOptionData, Assignment[]>(AssignOptionDialog, {
      data,
      width: 'min(560px, 100vw - 32px)',
    });
    return firstValueFrom(ref.afterClosed());
  }

  private async confirmArchive(count: number): Promise<boolean> {
    const data: ConfirmData = {
      title: count === 1 ? 'Se archiva una variante' : `Se archivan ${count} variantes`,
      message:
        'Tienen datos cargados y su valor ya no existe. Salen de circulación sin borrarse, y sus SKU quedan reservados.',
      confirm: 'Guardar y archivar',
    };
    const ref = this.dialog.open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, { data });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }

  private preview(options: VariationOption[], assignments: Assignment[]) {
    const product = this.product();
    let n = 0;
    return reconcileVariants({
      product,
      current: this.variants(),
      previousOptions: product.options,
      options,
      assignments,
      newVariantId: () => variantId(`vista-previa-${++n}`),
    });
  }

  private update(change: (options: readonly DraftOption[]) => readonly DraftOption[]): void {
    this.draft.update((draft) => ({ options: change(draft.options) }));
  }

  private updateValues(index: number, change: (values: DraftOption['values']) => DraftOption['values']): void {
    this.update((options) => options.map((option, i) => (i === index ? { ...option, values: change(option.values) } : option)));
  }

  private focus(id: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(`#${CSS.escape(id)}`)?.focus(), { injector: this.injector });
  }
}

function failureMessage(failure: CommandFailure): string {
  if (failure.code === 'version-conflict') {
    return 'Alguien más cambió las opciones mientras las editabas. Descartá tus cambios para ver las actuales.';
  }
  if (failure.code === 'limit-exceeded') {
    return `Se superan los topes: hasta ${MAX_OPTIONS} opciones y ${MAX_COMBINATIONS} combinaciones`;
  }
  return commandErrorMessage(failure.code);
}

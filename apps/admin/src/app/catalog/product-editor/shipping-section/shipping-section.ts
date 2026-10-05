import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { form, FormField, readonly } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatRadioButton, MatRadioGroup } from '@angular/material/radio';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  saleConditionChanges,
  type Dimensions,
  type Product,
  type ProductKind,
  type SaleConditionValue,
  type TenantId,
} from '@ecommerce/domain';
import { CATALOG_COMMANDS } from '../../../core/client';
import { commandErrorMessage } from '../../../shared/command-errors';
import { keepUnsaved } from '../../../shared/keep-unsaved';
import { trackUnsaved } from '../../../shared/pending-changes/pending-changes';
import { injectCan } from '../../../tenant/current-access';

/** Lo que se escribe: kilos y centímetros, como texto, para no pelear con la coma decimal. */
interface Measures {
  weight: string;
  length: string;
  width: string;
  height: string;
}

const show = (value: number | null | undefined, unit: number) => (value == null ? '' : String(value / unit));
const measuresOf = (product: Product): Measures => ({
  weight: show(product.weightGrams, 1000),
  length: show(product.dimensionsMm?.length, 10),
  width: show(product.dimensionsMm?.width, 10),
  height: show(product.dimensionsMm?.height, 10),
});

/** Qué le pasa al comprador con cada cambio del envío: el mismo dato que queda en la bitácora. */
const BUYER: Record<`${SaleConditionValue}>${SaleConditionValue}`, string> = {
  'charged>none': 'El comprador dejará de pagar envío: un producto digital no se envía.',
  'free>none': 'El comprador ya no tendrá envío gratis: un producto digital no se envía.',
  'none>charged': 'El comprador pasará a pagar envío.',
  'none>free': 'El comprador tendrá envío gratis, como antes de pasar a digital.',
} as Record<`${SaleConditionValue}>${SaleConditionValue}`, string>;

/**
 * Físico o digital, y el peso y las dimensiones de un físico (FR-013 a FR-017). Cambiar el tipo se
 * confirma en línea, después de leer qué cambia para el comprador: lo calcula `saleConditionChanges`,
 * la misma función que decide la entrada de bitácora (FR-016, FR-032).
 */
@Component({
  selector: 'app-shipping-section',
  imports: [FormField, MatFormField, MatLabel, MatSuffix, MatInput, MatButton, MatRadioGroup, MatRadioButton],
  templateUrl: './shipping-section.html',
  styleUrl: './shipping-section.scss',
})
export class ShippingSection {
  readonly tenantId = input.required<TenantId>();
  readonly product = input.required<Product>();

  private readonly commands = inject(CATALOG_COMMANDS);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly canWrite = injectCan('catalog.write');

  /** El tipo elegido y todavía sin confirmar. */
  protected readonly pendingKind = signal<ProductKind | null>(null);
  /** El tipo confirmado y en camino al servidor: se muestra hasta que llega la respuesta. */
  private readonly confirming = signal<ProductKind | null>(null);
  /**
   * Mientras el cambio viaja al servidor, el producto todavía tiene el tipo anterior: elegir otro
   * partiría de un estado que no es el definitivo. Los tipos se habilitan con la respuesta.
   */
  protected readonly kindLocked = computed(() => !this.canWrite() || this.confirming() !== null);
  protected readonly shownKind = computed(() => this.pendingKind() ?? this.confirming() ?? this.product().kind);
  protected readonly buyerImpact = computed(() => {
    const kind = this.pendingKind();
    if (!kind) return [];
    const product = this.product();
    return saleConditionChanges(product, { ...product, kind })
      .filter((change) => change.field === 'shipping')
      .map((change) => BUYER[`${change.before}>${change.after}`] ?? '');
  });

  private readonly stored = computed(() => measuresOf(this.product()));
  protected readonly measures = linkedSignal<Measures, Measures>({ source: this.stored, computation: keepUnsaved });
  protected readonly measuresForm = form(this.measures, (path) => {
    readonly(path, { when: () => !this.canWrite() });
  });
  protected readonly failure = signal('');
  protected readonly dirty = computed(() => {
    const [draft, stored] = [this.measures(), this.stored()];
    return (Object.keys(stored) as (keyof Measures)[]).some((key) => draft[key] !== stored[key]) || this.pendingKind() !== null;
  });

  constructor() {
    trackUnsaved(() => this.dirty());
  }

  protected choose(kind: ProductKind): void {
    this.pendingKind.set(kind === this.product().kind ? null : kind);
  }

  protected cancelKind(): void {
    this.pendingKind.set(null);
  }

  protected async confirmKind(): Promise<void> {
    const kind = this.pendingKind();
    if (!kind) return;
    // Antes de esperar: la actualización en tiempo real del producto suele llegar antes que la
    // respuesta, y lo que la persona elija en ese intervalo no puede pisarse al volver.
    this.pendingKind.set(null);
    this.confirming.set(kind);
    const product = this.product();
    const result = await this.commands.setProductType(this.tenantId(), { productId: product.id, version: product.version, kind });
    this.confirming.set(null);
    if (result.ok) this.snackBar.open(kind === 'digital' ? 'Ahora es un producto digital' : 'Ahora es un producto físico', undefined, { duration: 3000 });
    else this.failure.set(commandErrorMessage(result.code));
  }

  protected discard(): void {
    this.measures.set(this.stored());
    this.failure.set('');
  }

  protected async save(): Promise<void> {
    this.failure.set('');
    const parsed = parseMeasures(this.measures());
    if (typeof parsed === 'string') {
      this.failure.set(parsed);
      return;
    }
    const product = this.product();
    const result = await this.commands.setProductShipping(this.tenantId(), { productId: product.id, version: product.version, ...parsed });
    if (result.ok) this.snackBar.open('Datos de envío guardados', undefined, { duration: 3000 });
    else this.failure.set(result.code === 'version-conflict' ? 'Alguien más editó el producto mientras lo tenías abierto.' : commandErrorMessage(result.code));
  }
}

/** Kilos y centímetros escritos → gramos y milímetros enteros, o el motivo por el que no se puede. */
function parseMeasures(m: Measures): { weightGrams: number | null; dimensionsMm: Dimensions | null } | string {
  const weight = amount(m.weight, 1000);
  if (weight === 'invalid') return 'El peso tiene que ser un número mayor que cero.';
  const sides = [amount(m.length, 10), amount(m.width, 10), amount(m.height, 10)];
  if (sides.includes('invalid')) return 'Cada dimensión tiene que ser un número mayor que cero.';
  const filled = sides.filter((side) => side !== null);
  if (filled.length !== 0 && filled.length !== 3) return 'Completá largo, ancho y alto, o dejá los tres vacíos.';
  const [length, width, height] = sides as (number | null)[];
  return {
    weightGrams: weight,
    dimensionsMm: length != null && width != null && height != null ? { length, width, height } : null,
  };
}

function amount(written: string, unit: number): number | null | 'invalid' {
  const text = written.trim().replace(',', '.');
  if (text === '') return null;
  const value = Math.round(Number(text) * unit);
  return Number.isFinite(value) && value > 0 ? value : 'invalid';
}

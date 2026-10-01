import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatRadioButton, MatRadioGroup } from '@angular/material/radio';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import type { CommandFailure } from '@ecommerce/application';
import { canChangeStatus, type Product, type ProductStatus, type TenantId, type Variant, type VariantId } from '@ecommerce/domain';
import { firstValueFrom } from 'rxjs';
import { CATALOG_COMMANDS } from '../../../core/client';
import { commandErrorMessage } from '../../../shared/command-errors';
import { ConfirmDialog, type ConfirmData } from '../../../shared/confirm-dialog';
import { combinationLabel } from '../../shared/variant-labels';

const STATUS_NAMES: Record<ProductStatus, string> = { draft: 'Borrador', active: 'Activo', unlisted: 'No listado' };

/**
 * Estado de publicación (T059, FR-023a) y archivado (FR-023). Pasar a activo o a no listado exige
 * que todas las variantes tengan SKU: el panel dice cuáles faltan antes de enviar, con la misma
 * regla del dominio que aplica el servidor.
 */
@Component({
  selector: 'app-status-control',
  imports: [MatRadioGroup, MatRadioButton, MatButton],
  templateUrl: './status-control.html',
  styleUrl: './status-control.scss',
})
export class StatusControl {
  readonly tenantId = input.required<TenantId>();
  readonly product = input.required<Product>();
  readonly variants = input.required<readonly Variant[]>();

  private readonly commands = inject(CATALOG_COMMANDS);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly statuses: readonly { value: ProductStatus; name: string; hint: string }[] = [
    { value: 'draft', name: STATUS_NAMES.draft, hint: 'No se ofrece a compradores.' },
    { value: 'active', name: STATUS_NAMES.active, hint: 'Se ofrece en la tienda.' },
    { value: 'unlisted', name: STATUS_NAMES.unlisted, hint: 'Solo se llega con el enlace directo.' },
  ];

  /**
   * El estado elegido; vuelve al guardado solo cuando el servidor cambia el estado. Depende de un
   * `computed` y no del producto entero: completar un SKU cambia el producto, no su estado.
   */
  private readonly storedStatus = computed(() => this.product().status);
  protected readonly target = linkedSignal(() => this.storedStatus());
  /** Las variantes que el servidor dijo que impiden el cambio, si cambiaron mientras tanto. */
  private readonly rejectedIds = signal<readonly VariantId[]>([]);
  protected readonly failure = signal('');
  protected readonly saving = signal(false);

  protected readonly blocking = computed(() => {
    const allowed = canChangeStatus(this.variants(), this.target());
    const ids = !allowed.ok && allowed.error.kind === 'incomplete-variants' ? allowed.error.variantIds : this.rejectedIds();
    const options = this.product().options;
    return this.variants()
      .filter((variant) => ids.includes(variant.id))
      .map((variant) => combinationLabel(options, variant.optionValues));
  });
  protected readonly noVariants = computed(() => {
    const allowed = canChangeStatus(this.variants(), this.target());
    return !allowed.ok && allowed.error.kind === 'no-variants';
  });
  protected readonly targetName = computed(() => STATUS_NAMES[this.target()]);

  protected choose(status: ProductStatus): void {
    this.target.set(status);
    this.rejectedIds.set([]);
    this.failure.set('');
  }

  protected async apply(): Promise<void> {
    const product = this.product();
    this.saving.set(true);
    this.failure.set('');
    const result = await this.commands.setProductStatus(this.tenantId(), { productId: product.id, version: product.version, status: this.target() });
    this.saving.set(false);
    if (result.ok) {
      this.snackBar.open(`El producto ahora está «${STATUS_NAMES[this.target()]}»`, undefined, { duration: 3000 });
    } else if (result.code === 'incomplete-variants') {
      this.rejectedIds.set(rejectedVariants(result));
    } else {
      this.failure.set(commandErrorMessage(result.code));
    }
  }

  protected async archive(): Promise<void> {
    const product = this.product();
    const data: ConfirmData = {
      title: `¿Archivar «${product.name}»?`,
      message: 'Sale del catálogo sin borrarse: sus variantes, su historial y sus SKU se conservan, y los SKU quedan reservados.',
      confirm: 'Archivar producto',
    };
    const confirmed = await firstValueFrom(this.dialog.open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, { data }).afterClosed());
    if (confirmed !== true) return;

    const result = await this.commands.archiveProduct(this.tenantId(), { productId: product.id, version: product.version });
    if (result.ok) {
      this.snackBar.open(`Archivaste «${product.name}»`, undefined, { duration: 4000 });
      await this.router.navigate(['/t', this.tenantId(), 'catalog']);
    } else {
      this.failure.set(commandErrorMessage(result.code));
    }
  }
}

function rejectedVariants(failure: CommandFailure): readonly VariantId[] {
  const details = failure.details as { variantIds?: unknown } | undefined;
  return Array.isArray(details?.variantIds) ? (details.variantIds as VariantId[]) : [];
}

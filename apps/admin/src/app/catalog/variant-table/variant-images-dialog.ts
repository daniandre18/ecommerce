import { Component, inject, type Signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogActions, MatDialogClose, MatDialogContent, MatDialogTitle } from '@angular/material/dialog';
import type { ImageRef, ProductId, TenantId, Variant } from '@ecommerce/domain';
import { CATALOG_COMMANDS } from '../../core/client';
import { ImageUpload } from '../image-upload/image-upload';

export interface VariantImagesData {
  readonly tenantId: TenantId;
  readonly productId: ProductId;
  readonly label: string;
  /** La variante en tiempo real: cada guardado usa su versión vigente. */
  readonly variant: Signal<Variant>;
}

/** Las imágenes propias de una variante (T060, FR-020). */
@Component({
  selector: 'app-variant-images-dialog',
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose, MatButton, ImageUpload],
  template: `
    <h2 mat-dialog-title>Imágenes de {{ data.label }}</h2>
    <mat-dialog-content>
      <app-image-upload
        heading="Imágenes de la variante"
        [tenantId]="data.tenantId"
        [productId]="data.productId"
        [images]="data.variant().images"
        [save]="save"
      />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Listo</button>
    </mat-dialog-actions>
  `,
})
export class VariantImagesDialog {
  protected readonly data = inject<VariantImagesData>(MAT_DIALOG_DATA);
  private readonly commands = inject(CATALOG_COMMANDS);

  protected readonly save = (images: ImageRef[]) => {
    const variant = this.data.variant();
    return this.commands.setVariantImages(this.data.tenantId, { productId: this.data.productId, variantId: variant.id, version: variant.version, images });
  };
}

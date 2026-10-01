import { LiveAnnouncer } from '@angular/cdk/a11y';
import { afterNextRender, Component, DestroyRef, ElementRef, inject, Injector, input, signal } from '@angular/core';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import type { CommandResult, UploadFailure } from '@ecommerce/application';
import { IMAGE_CONTENT_TYPES, MAX_IMAGE_BYTES, type ImageRef, type ProductId, type TenantId } from '@ecommerce/domain';
import { IMAGE_STORAGE } from '../../core/client';
import { commandErrorMessage } from '../../shared/command-errors';
import { trackUnsaved } from '../../shared/pending-changes/pending-changes';
import { injectCan } from '../../tenant/current-access';
import { StorageImage } from './storage-image';

const UPLOAD_FAILURES: Record<UploadFailure, string> = {
  'not-allowed': 'El servidor no aceptó la imagen: revisá el formato y el peso, o tus permisos.',
  interrupted: 'La subida se interrumpió. Lo elegido sigue acá: reintentá.',
  unavailable: 'No hay conexión con el servidor. Revisá tu red y reintentá.',
};

/** El problema de un archivo antes de subirlo, con las mismas reglas que aplica `storage.rules`. */
function fileProblem(file: File): string | undefined {
  if (!(IMAGE_CONTENT_TYPES as readonly string[]).includes(file.type)) return 'Ese formato no se admite. Usá JPG, PNG, WebP, AVIF o GIF.';
  if (file.size > MAX_IMAGE_BYTES) return 'La imagen pesa más de 5 MB. Achicala y volvé a elegirla.';
  return undefined;
}

let instances = 0;

/**
 * Las imágenes de un producto o de una variante (T060). Subir el archivo y guardar la referencia
 * son dos pasos: si el primero se corta, lo elegido y lo escrito se conservan (FR-039); si se
 * subió pero no se pudo guardar, el reintento solo guarda.
 */
@Component({
  selector: 'app-image-upload',
  imports: [FormField, MatFormField, MatLabel, MatHint, MatError, MatInput, MatButton, MatProgressBar, StorageImage],
  templateUrl: './image-upload.html',
  styleUrl: './image-upload.scss',
})
export class ImageUpload {
  readonly tenantId = input.required<TenantId>();
  readonly productId = input.required<ProductId>();
  readonly images = input.required<readonly ImageRef[]>();
  /** Guarda la lista completa de referencias, del producto o de la variante. */
  readonly save = input.required<(images: ImageRef[]) => Promise<CommandResult<unknown>>>();
  readonly heading = input('Imágenes');

  private readonly storage = inject(IMAGE_STORAGE);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  /** Sin `catalog.write` las imágenes se ven, pero no se agregan ni se quitan (T079). */
  protected readonly canWrite = injectCan('catalog.write');

  protected readonly headingId = `imagenes-${++instances}`;
  protected readonly accept = IMAGE_CONTENT_TYPES.join(',');

  protected readonly chosen = signal<{ file: File; preview: string } | undefined>(undefined);
  protected readonly draft = signal({ alt: '' });
  protected readonly altForm = form(this.draft, (path) => {
    required(path.alt, { message: 'Describí la imagen para quien no puede verla' });
  });
  protected readonly progress = signal<number | undefined>(undefined);
  /** Subida y todavía sin referencia guardada: el reintento solo guarda. */
  protected readonly uploadedPath = signal<string | undefined>(undefined);
  protected readonly failure = signal('');

  constructor() {
    inject(DestroyRef).onDestroy(() => this.releasePreview());
    // Una imagen elegida y todavía sin subir también es trabajo en curso.
    trackUnsaved(() => this.chosen() !== undefined);
  }

  protected choose(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const problem = fileProblem(file);
    if (problem) {
      this.failure.set(problem);
      return;
    }
    this.releasePreview();
    this.chosen.set({ file, preview: URL.createObjectURL(file) });
    this.uploadedPath.set(undefined);
    this.failure.set('');
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLInputElement>('form input')?.focus(), { injector: this.injector });
  }

  protected upload(): void {
    void submit(this.altForm, async () => {
      await this.uploadAndSave();
      return undefined;
    });
  }

  protected cancel(): void {
    this.releasePreview();
    this.chosen.set(undefined);
    this.uploadedPath.set(undefined);
    this.draft.set({ alt: '' });
    this.altForm().reset();
    this.failure.set('');
  }

  protected async remove(index: number): Promise<void> {
    const removed = this.images()[index];
    const remaining = this.images()
      .filter((_, i) => i !== index)
      .map((image, position) => ({ ...image, position }));
    const saved = await this.save()(remaining);
    if (saved.ok) void this.announcer.announce(`Imagen «${removed?.alt ?? ''}» quitada`);
    else this.failure.set(commandErrorMessage(saved.code));
  }

  private async uploadAndSave(): Promise<void> {
    const chosen = this.chosen();
    if (!chosen) return;
    this.failure.set('');

    let storagePath = this.uploadedPath();
    if (!storagePath) {
      this.progress.set(0);
      const uploaded = await this.storage.upload({
        tenantId: this.tenantId(),
        productId: this.productId(),
        file: chosen.file,
        onProgress: (fraction) => this.progress.set(fraction),
      });
      this.progress.set(undefined);
      if (!uploaded.ok) {
        this.failure.set(UPLOAD_FAILURES[uploaded.reason]);
        return;
      }
      storagePath = uploaded.storagePath;
      this.uploadedPath.set(storagePath);
    }

    const images = [...this.images(), { storagePath, alt: this.draft().alt.trim(), position: this.images().length }];
    const saved = await this.save()(images);
    if (!saved.ok) {
      this.failure.set(commandErrorMessage(saved.code));
      return;
    }
    void this.announcer.announce('Imagen agregada');
    this.cancel();
  }

  private releasePreview(): void {
    const preview = this.chosen()?.preview;
    if (preview) URL.revokeObjectURL(preview);
  }
}

import type { ProductId, TenantId } from '@ecommerce/domain';

/** Por qué no se pudo subir. "No permitido" incluye tipo o peso fuera de las reglas del servidor. */
export type UploadFailure = 'not-allowed' | 'interrupted' | 'unavailable';

export type UploadResult = { readonly ok: true; readonly storagePath: string } | { readonly ok: false; readonly reason: UploadFailure };

export interface UploadRequest {
  readonly tenantId: TenantId;
  readonly productId: ProductId;
  readonly file: Blob;
  /** Avance entre 0 y 1. */
  readonly onProgress?: (fraction: number) => void;
  /** Para cancelar una subida en curso. */
  readonly signal?: AbortSignal;
}

/**
 * Los archivos de imagen. Subir no los asocia a nada: la referencia, con su texto alternativo, la
 * guarda una orden aparte (`updateProductDetails`, `setVariantImages`).
 */
export interface ImageStorage {
  /** Sube un archivo nuevo, siempre con un nombre nuevo, a la carpeta de imágenes del producto. */
  upload(request: UploadRequest): Promise<UploadResult>;
  /** La dirección para mostrar una imagen a quien puede leerla. */
  displayUrl(storagePath: string): Promise<string>;
}

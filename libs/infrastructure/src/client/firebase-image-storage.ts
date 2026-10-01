import type { ImageStorage, UploadFailure, UploadRequest, UploadResult } from '@ecommerce/application';
import { getDownloadURL, ref, uploadBytesResumable, type FirebaseStorage } from 'firebase/storage';

const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

/**
 * Subida directa a Cloud Storage. Quién, qué tipo, cuánto y dónde lo deciden `storage.rules` en el
 * servidor; el nombre es nuevo en cada subida, porque una imagen subida no se reemplaza.
 */
export class FirebaseImageStorage implements ImageStorage {
  constructor(private readonly storage: FirebaseStorage) {}

  upload({ tenantId, productId, file, onProgress, signal }: UploadRequest): Promise<UploadResult> {
    const storagePath = `tenants/${tenantId}/products/${productId}/images/${crypto.randomUUID()}.${EXTENSIONS[file.type] ?? 'img'}`;
    const task = uploadBytesResumable(ref(this.storage, storagePath), file, { contentType: file.type });
    signal?.addEventListener('abort', () => task.cancel(), { once: true });
    return new Promise((resolve) => {
      task.on(
        'state_changed',
        (snapshot) => onProgress?.(snapshot.totalBytes > 0 ? snapshot.bytesTransferred / snapshot.totalBytes : 0),
        (error) => resolve({ ok: false, reason: uploadFailure(error) }),
        () => resolve({ ok: true, storagePath }),
      );
    });
  }

  displayUrl(storagePath: string): Promise<string> {
    return getDownloadURL(ref(this.storage, storagePath));
  }
}

/** Exportada para probarla sin emulador. */
export function uploadFailure(error: unknown): UploadFailure {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'storage/unauthorized' || code === 'storage/unauthenticated') return 'not-allowed';
  if (code === 'storage/canceled') return 'interrupted';
  if (code === 'storage/retry-limit-exceeded') return 'unavailable';
  console.error('Falla inesperada al subir una imagen', error);
  return 'interrupted';
}

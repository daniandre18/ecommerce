import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let instance: Firestore | undefined;

/**
 * Firestore del Admin SDK. Con `FIRESTORE_EMULATOR_HOST` definido —lo define `emulators:exec`—
 * se conecta al emulador sin credenciales.
 */
export function firestore(projectId = process.env['GCLOUD_PROJECT'] ?? 'demo-ecommerce'): Firestore {
  if (!instance) {
    const app = getApps()[0] ?? initializeApp({ projectId });
    instance = getFirestore(app);
    // Los campos opcionales ausentes se omiten en lugar de romper la escritura.
    instance.settings({ ignoreUndefinedProperties: true });
  }
  return instance;
}

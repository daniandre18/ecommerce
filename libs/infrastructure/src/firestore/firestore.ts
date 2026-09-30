import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let instance: Firestore | undefined;

/**
 * Firestore del Admin SDK, una sola instancia por proceso. El proyecto sale de `GCLOUD_PROJECT`,
 * que definen tanto Cloud Functions como `emulators:exec`. Con `FIRESTORE_EMULATOR_HOST` definido
 * se conecta al emulador sin credenciales.
 */
export function firestore(): Firestore {
  if (!instance) {
    const app = getApps()[0] ?? initializeApp({ projectId: process.env['GCLOUD_PROJECT'] ?? 'demo-ecommerce' });
    instance = getFirestore(app);
    // Los campos opcionales ausentes se omiten en lugar de romper la escritura.
    instance.settings({ ignoreUndefinedProperties: true });
  }
  return instance;
}

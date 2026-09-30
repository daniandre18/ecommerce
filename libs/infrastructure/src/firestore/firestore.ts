import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { firebaseApp } from '../firebase-app';

let instance: Firestore | undefined;

/**
 * Firestore del Admin SDK, una sola instancia por proceso. Con `FIRESTORE_EMULATOR_HOST` definido
 * se conecta al emulador sin credenciales.
 */
export function firestore(): Firestore {
  if (!instance) {
    instance = getFirestore(firebaseApp());
    // Los campos opcionales ausentes se omiten en lugar de romper la escritura.
    instance.settings({ ignoreUndefinedProperties: true });
  }
  return instance;
}

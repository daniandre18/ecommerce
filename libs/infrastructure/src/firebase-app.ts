import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

/**
 * La app del Admin SDK, inicializada una sola vez y en un solo lugar. Todos los servicios de
 * Firebase se obtienen a partir de ella, así que ninguno depende de que otro se haya pedido antes.
 * El proyecto sale de `GCLOUD_PROJECT`, que definen Cloud Functions y `emulators:exec`.
 */
export function firebaseApp(): App {
  return getApps()[0] ?? initializeApp({ projectId: process.env['GCLOUD_PROJECT'] ?? 'demo-ecommerce' });
}

/** Con `FIREBASE_AUTH_EMULATOR_HOST` definido se conecta al emulador de Auth. */
export function auth(): Auth {
  return getAuth(firebaseApp());
}

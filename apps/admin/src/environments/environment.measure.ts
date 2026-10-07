import type { WebClientConfig } from '@ecommerce/infrastructure/client';

/**
 * La medición de rendimiento (`admin-e2e:perf`): los emuladores de `environment.ts`, pero Firestore
 * detrás de un proxy que comprime con gzip, como lo entrega Firestore en producción (research §14 de
 * la 002). Se escribe entero: reemplaza a `environment.ts`, así que importarlo sería importarse a sí mismo.
 */
export const environment: WebClientConfig = {
  firebase: {
    projectId: 'demo-ecommerce',
    apiKey: 'demo-key',
    appId: 'demo-admin',
    authDomain: 'demo-ecommerce.firebaseapp.com',
    storageBucket: 'demo-ecommerce.appspot.com',
  },
  functionsRegion: 'us-central1',
  emulators: { host: '127.0.0.1', ports: { auth: 9099, firestore: 8090, functions: 5001, storage: 9199 } },
};

import type { WebClientConfig } from '@ecommerce/infrastructure/client';

/**
 * Desarrollo y pruebas de extremo a extremo: siempre contra los emuladores, con un proyecto `demo-*`
 * que no existe en Firebase. Los puertos son los de `firebase.json`.
 */
export const environment: WebClientConfig = {
  firebase: { projectId: 'demo-ecommerce', apiKey: 'demo-key', appId: 'demo-admin', authDomain: 'demo-ecommerce.firebaseapp.com' },
  functionsRegion: 'us-central1',
  emulators: { host: '127.0.0.1', ports: { auth: 9099, firestore: 8080, functions: 5001 } },
};

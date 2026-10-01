import type { WebClientConfig } from '@ecommerce/infrastructure/client';

/**
 * Proyecto real. ⚠️ Todavía no existe: al crearlo hay que completar la configuración del SDK web, la
 * región (la misma que Firestore y las Functions) y la clave de reCAPTCHA Enterprise de App Check.
 * Mientras falte la clave, el panel se niega a arrancar en lugar de llamar a callables que la
 * guarda rechazaría.
 */
export const environment: WebClientConfig = {
  firebase: { projectId: '', apiKey: '', appId: '', authDomain: '', storageBucket: '' },
  functionsRegion: 'us-central1',
  appCheckSiteKey: '',
};

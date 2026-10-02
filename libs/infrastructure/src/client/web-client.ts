import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { CustomProvider, initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';

/** Los puertos de `firebase.json`. */
export interface EmulatorPorts {
  readonly auth: number;
  readonly firestore: number;
  readonly functions: number;
  readonly storage: number;
}

interface CommonConfig {
  readonly firebase: FirebaseOptions;
  /** La región de las Functions (`apps/functions/src/index.ts`). */
  readonly functionsRegion: string;
}

/**
 * Contra los emuladores, o contra un proyecto real con App Check. No hay una tercera opción: un
 * proyecto real sin App Check tendría todas sus callable rechazadas por la guarda.
 */
export type WebClientConfig =
  | (CommonConfig & { readonly emulators: { readonly host: string; readonly ports: EmulatorPorts } })
  | (CommonConfig & { readonly appCheckSiteKey: string });

export interface WebClient {
  readonly auth: Auth;
  readonly firestore: Firestore;
  readonly functions: Functions;
  readonly storage: FirebaseStorage;
}

export function connectWebClient(config: WebClientConfig): WebClient {
  if ('appCheckSiteKey' in config && !config.appCheckSiteKey) {
    throw new Error('Falta la clave de App Check del proyecto real: sin ella, la guarda rechazaría toda orden');
  }
  const app = initializeApp(config.firebase);
  const client = {
    // Lo mismo que `getAuth` en el navegador, sin el resolvedor de popup y redirección: el panel entra
    // con correo y contraseña, y ese resolvedor descarga gapi y un iframe antes de que la sesión esté
    // lista, ~1 s de la primera visita en una conexión móvil (SC-009).
    auth: initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] }),
    firestore: getFirestore(app),
    functions: getFunctions(app, config.functionsRegion),
    storage: getStorage(app),
  };

  if ('emulators' in config) {
    assertDemoProject(config.firebase.projectId);
    const { host, ports } = config.emulators;
    connectAuthEmulator(client.auth, `http://${host}:${ports.auth}`, { disableWarnings: true });
    connectFirestoreEmulator(client.firestore, host, ports.firestore);
    connectFunctionsEmulator(client.functions, host, ports.functions);
    connectStorageEmulator(client.storage, host, ports.storage);
    initializeAppCheck(app, { provider: emulatorAppCheck(config.firebase.appId ?? 'demo-app'), isTokenAutoRefreshEnabled: true });
  } else {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(config.appCheckSiteKey), isTokenAutoRefreshEnabled: true });
  }
  return client;
}

/** Igual que el sembrador: los emuladores nunca se mezclan con un proyecto real. */
function assertDemoProject(projectId: string | undefined): void {
  if (!projectId?.startsWith('demo-')) {
    throw new Error(`Los emuladores exigen un proyecto demo-*; se configuró ${JSON.stringify(projectId)}`);
  }
}

/**
 * El emulador de Functions decodifica el token de App Check sin verificar su firma. Este proveedor
 * le entrega uno local sin firmar, así la guarda del servidor exige App Check igual que en
 * producción y no necesita una excepción para el emulador.
 */
function emulatorAppCheck(appId: string): CustomProvider {
  return new CustomProvider({
    getToken: () => {
      const expireTimeMillis = Date.now() + 60 * 60 * 1000;
      const token = `${base64Url({ alg: 'none', typ: 'JWT' })}.${base64Url({ sub: appId, exp: Math.floor(expireTimeMillis / 1000) })}.`;
      return Promise.resolve({ token, expireTimeMillis });
    },
  });
}

/** El relleno `=` solo aparece al final en base64, así que quitarlos todos es quitar el relleno. */
const base64Url = (json: object) => btoa(JSON.stringify(json)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

import { InjectionToken, inject, makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';
import type { CatalogCommands, CatalogQueries, Session } from '@ecommerce/application';
import {
  CallableCatalogCommands,
  connectWebClient,
  FirebaseSession,
  FirestoreCatalogQueries,
  type WebClient,
  type WebClientConfig,
} from '@ecommerce/infrastructure/client';

// Los componentes dependen de los puertos, nunca del SDK: en las pruebas se reemplazan por dobles.
export const SESSION = new InjectionToken<Session>('Session');
export const CATALOG_QUERIES = new InjectionToken<CatalogQueries>('CatalogQueries');
export const CATALOG_COMMANDS = new InjectionToken<CatalogCommands>('CatalogCommands');

const WEB_CLIENT = new InjectionToken<WebClient>('WebClient');

/** Conecta Firebase una sola vez, al pedirse el primer puerto. */
export function provideWebClient(config: WebClientConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: WEB_CLIENT, useFactory: () => connectWebClient(config) },
    { provide: SESSION, useFactory: () => new FirebaseSession(inject(WEB_CLIENT).auth) },
    { provide: CATALOG_QUERIES, useFactory: () => new FirestoreCatalogQueries(inject(WEB_CLIENT).firestore) },
    { provide: CATALOG_COMMANDS, useFactory: () => new CallableCatalogCommands(inject(WEB_CLIENT).functions) },
  ]);
}

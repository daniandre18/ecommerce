import { InjectionToken, inject, makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';
import type { AuditQueries, CatalogCommands, CatalogQueries, ImageStorage, Session, TeamCommands, TeamQueries, TenantDirectory } from '@ecommerce/application/client';
import {
  CallableCatalogCommands,
  CallableTeamCommands,
  connectWebClient,
  FirebaseImageStorage,
  FirebaseSession,
  FirestoreAuditQueries,
  FirestoreCatalogQueries,
  FirestoreTeamQueries,
  FirestoreTenantDirectory,
  type WebClient,
  type WebClientConfig,
} from '@ecommerce/infrastructure/client';

// Los componentes dependen de los puertos, nunca del SDK: en las pruebas se reemplazan por dobles.
export const SESSION = new InjectionToken<Session>('Session');
export const CATALOG_QUERIES = new InjectionToken<CatalogQueries>('CatalogQueries');
export const CATALOG_COMMANDS = new InjectionToken<CatalogCommands>('CatalogCommands');
export const IMAGE_STORAGE = new InjectionToken<ImageStorage>('ImageStorage');
export const TENANT_DIRECTORY = new InjectionToken<TenantDirectory>('TenantDirectory');
export const TEAM_QUERIES = new InjectionToken<TeamQueries>('TeamQueries');
export const TEAM_COMMANDS = new InjectionToken<TeamCommands>('TeamCommands');
export const AUDIT_QUERIES = new InjectionToken<AuditQueries>('AuditQueries');

const WEB_CLIENT = new InjectionToken<WebClient>('WebClient');

/** Conecta Firebase una sola vez, al pedirse el primer puerto. */
export function provideWebClient(config: WebClientConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: WEB_CLIENT, useFactory: () => connectWebClient(config) },
    { provide: SESSION, useFactory: () => new FirebaseSession(inject(WEB_CLIENT).auth) },
    { provide: CATALOG_QUERIES, useFactory: () => new FirestoreCatalogQueries(inject(WEB_CLIENT).firestore) },
    { provide: CATALOG_COMMANDS, useFactory: () => new CallableCatalogCommands(inject(WEB_CLIENT).functions) },
    { provide: IMAGE_STORAGE, useFactory: () => new FirebaseImageStorage(inject(WEB_CLIENT).storage) },
    { provide: TENANT_DIRECTORY, useFactory: () => new FirestoreTenantDirectory(inject(WEB_CLIENT).firestore) },
    { provide: TEAM_QUERIES, useFactory: () => new FirestoreTeamQueries(inject(WEB_CLIENT).firestore) },
    { provide: TEAM_COMMANDS, useFactory: () => new CallableTeamCommands(inject(WEB_CLIENT).functions) },
    { provide: AUDIT_QUERIES, useFactory: () => new FirestoreAuditQueries(inject(WEB_CLIENT).firestore) },
  ]);
}

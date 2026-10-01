import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withRouterConfig } from '@angular/router';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { provideWebClient } from './core/client';

// Zoneless es el comportamiento por defecto desde Angular 21: no hace falta
// `provideZonelessChangeDetection()` mientras `zone.js` no esté instalado.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Los parámetros de la ruta del comercio llegan como inputs también a las vistas hijas.
    provideRouter(routes, withComponentInputBinding(), withRouterConfig({ paramsInheritanceStrategy: 'always' })),
    provideWebClient(environment),
  ],
};

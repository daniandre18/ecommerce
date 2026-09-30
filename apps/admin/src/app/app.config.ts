import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';

// Zoneless es el comportamiento por defecto desde Angular 21: no hace falta
// `provideZonelessChangeDetection()` mientras `zone.js` no esté instalado.
export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideRouter(routes, withComponentInputBinding())],
};

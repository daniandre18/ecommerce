import type { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

// Todo lo de un comercio cuelga de /t/{tenantId}/…: el comercio activo es la ruta, no un estado
// escondido. Equipo y bitácora se suman con sus historias (T075, T085).
export const routes: Routes = [
  { path: 'login', title: 'Iniciar sesión', loadComponent: () => import('./auth/login/login').then((m) => m.Login) },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Tu comercio',
        loadComponent: () => import('./tenant/tenant-entry/tenant-entry').then((m) => m.TenantEntry),
      },
      {
        path: 't/:tenantId',
        loadComponent: () => import('./tenant/tenant-shell/tenant-shell').then((m) => m.TenantShell),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'catalog' },
          {
            path: 'catalog',
            title: 'Catálogo',
            loadComponent: () => import('./catalog/product-list/product-list').then((m) => m.ProductList),
          },
          {
            path: 'catalog/:productId',
            title: 'Producto',
            loadComponent: () => import('./catalog/product-editor/product-editor').then((m) => m.ProductEditor),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];

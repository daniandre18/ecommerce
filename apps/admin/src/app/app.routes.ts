import type { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

// Todo lo de un comercio cuelga de /t/{tenantId}/…: el comercio activo es la ruta, no un estado
// escondido, y cambiar de comercio es navegar (T075). Equipo y bitácora se suman con sus historias.
export const routes: Routes = [
  { path: 'login', title: 'Iniciar sesión', loadComponent: () => import('./auth/login/login').then((m) => m.Login) },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Tus comercios',
        loadComponent: () => import('./tenant/tenant-switcher/tenant-picker').then((m) => m.TenantPicker),
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

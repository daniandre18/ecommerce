import type { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

// Todo lo de un comercio cuelga de /t/{tenantId}/…: el comercio activo es la ruta, no un estado
// escondido, y cambiar de comercio es navegar (T075).
// El enlace de una invitación (`/invitation/…`) exige sesión, pero no membresía: la crea al aceptar.
export const routes: Routes = [
  { path: 'login', title: 'Iniciar sesión', loadComponent: () => import('./auth/login/login').then((m) => m.Login) },
  { path: 'signup', title: 'Crear cuenta', loadComponent: () => import('./auth/sign-up/sign-up').then((m) => m.SignUp) },
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
        path: 'invitation/:tenantId/:invitationId',
        title: 'Invitación',
        loadComponent: () => import('./team/accept-invitation/accept-invitation').then((m) => m.AcceptInvitation),
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
          { path: 'team', title: 'Equipo', loadComponent: () => import('./team/team-page').then((m) => m.TeamPage) },
          { path: 'audit', title: 'Bitácora', loadComponent: () => import('./audit/audit-log/audit-log').then((m) => m.AuditLog) },
          {
            path: 'team/roles/:roleId',
            title: 'Rol',
            loadComponent: () => import('./team/role-editor/role-editor').then((m) => m.RoleEditor),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];

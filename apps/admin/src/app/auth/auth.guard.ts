import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { SESSION } from '../core/client';
import { MyTenants } from '../tenant/my-tenants';

/**
 * Sin sesión, al inicio de sesión, recordando adónde se quería ir. Es comodidad, no seguridad: las
 * reglas de Firestore y la guarda de las callable deciden qué puede leer y hacer cada cuenta.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  // Todo `inject` antes del primer `await`: después ya no hay contexto de inyección.
  const session = inject(SESSION);
  const router = inject(Router);
  // Los comercios de la cuenta empiezan a escucharse ya, no cuando llega el marco: abrir el canal de
  // Firestore lleva varias idas y vueltas, y así ocurre mientras se descarga la vista (SC-009).
  inject(MyTenants);
  const user = await session.current();
  return user ? true : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

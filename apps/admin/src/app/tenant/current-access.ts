import { computed, inject, InjectionToken, type Signal } from '@angular/core';
import { allows, type MemberAccess, type Permission } from '@ecommerce/domain';

/**
 * Qué puede hacer la cuenta en el comercio de la ruta, tal como lo escucha su marco: `undefined`
 * mientras carga y `null` sin membresía activa. Sirve para no ofrecer lo que el servidor rechazaría;
 * el control real está en el servidor (FR-010, FR-040).
 */
export const CURRENT_ACCESS = new InjectionToken<Signal<MemberAccess | null | undefined>>('CurrentAccess');

/** Mientras el acceso carga, o sin acceso, no se concede nada: lo que no se ofrece no se puede intentar. */
export function grants(access: MemberAccess | null | undefined, permission: Permission): boolean {
  return access != null && allows(access, permission);
}

/** ¿Lo concede el acceso de la cuenta en este comercio? Se llama en un contexto de inyección. */
export function injectCan(permission: Permission): Signal<boolean> {
  const access = inject(CURRENT_ACCESS);
  return computed(() => grants(access(), permission));
}

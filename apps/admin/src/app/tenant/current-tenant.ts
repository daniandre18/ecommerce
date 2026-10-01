import { InjectionToken, type Signal } from '@angular/core';
import type { Tenant } from '@ecommerce/domain';

/**
 * El comercio de la ruta, tal como lo escucha su marco. Las vistas hijas lo leen de acá —por
 * ejemplo, para la moneda— en lugar de abrir otra suscripción al mismo documento.
 */
export const CURRENT_TENANT = new InjectionToken<Signal<Tenant | undefined>>('CurrentTenant');

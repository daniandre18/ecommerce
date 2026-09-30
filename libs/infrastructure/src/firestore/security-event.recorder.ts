import type { SecurityEvent, SecurityEventRecorder } from '@ecommerce/application';
import type { Firestore } from 'firebase-admin/firestore';

/**
 * Registra intentos denegados que atraviesan la capa de servicios (FR-004). Escribe FUERA de la
 * transacción de la operación denegada: esa transacción se revierte, y el evento tiene que quedar.
 * Los rechazos en la capa de reglas no llegan acá: esa capa deniega pero no puede escribir.
 */
export class FirestoreSecurityEventRecorder implements SecurityEventRecorder {
  constructor(private readonly db: Firestore) {}

  async record(event: SecurityEvent): Promise<void> {
    await this.db.collection(`tenants/${event.tenantId}/securityEvents`).add({ ...event });
  }
}

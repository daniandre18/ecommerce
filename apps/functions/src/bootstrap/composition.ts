import { randomUUID } from 'node:crypto';
import { RoleBasedAuthorizationService } from '@ecommerce/application';
import { FirestoreCategoryPruner, firestore, FirestoreSecurityEventRecorder, FirestoreUnitOfWork } from '@ecommerce/infrastructure';
import type { CategoryDependencies } from '../categories/callables';
import type { CallableDependencies } from './callable';

/** Raíz de composición: los puertos con sus adaptadores de Firestore, un juego por instancia. */
export function productionDependencies(): CallableDependencies & CategoryDependencies {
  const db = firestore();
  return {
    unitOfWorkFor: (tenantId) => new FirestoreUnitOfWork(db, tenantId),
    authorization: new RoleBasedAuthorizationService(),
    securityEvents: new FirestoreSecurityEventRecorder(db),
    clock: { now: () => new Date() },
    ids: { next: () => randomUUID() },
    prunerFor: (tenantId) => new FirestoreCategoryPruner(db, tenantId),
  };
}

import type { TenantId } from '@ecommerce/domain';
import type { Firestore } from 'firebase-admin/firestore';

/**
 * Rutas de UN comercio. El `tenantId` se fija al construir, así que ningún repositorio puede armar
 * una ruta de otro comercio: el aislamiento es estructural también del lado del servidor (FR-002).
 */
export class TenantPaths {
  constructor(
    private readonly db: Firestore,
    readonly tenantId: TenantId,
  ) {}

  /** El documento del comercio mismo: `tenants/{tenantId}`. */
  tenantDoc() {
    return this.db.doc(`tenants/${this.tenantId}`);
  }

  collection(name: string) {
    return this.db.collection(`tenants/${this.tenantId}/${name}`);
  }

  doc(path: string) {
    return this.db.doc(`tenants/${this.tenantId}/${path}`);
  }
}

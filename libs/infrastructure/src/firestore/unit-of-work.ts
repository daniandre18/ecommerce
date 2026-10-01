import type { TransactionScope, UnitOfWork } from '@ecommerce/application';
import type { TenantId } from '@ecommerce/domain';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { auditLogRepository } from './repositories/audit-log.repository';
import { invitationRepository } from './repositories/invitation.repository';
import {
  productRepository,
  skuIndexRepository,
  tenantRepository,
  variantRepository,
} from './repositories/catalog.repositories';
import { membershipRepository } from './repositories/membership.repository';
import { roleRepository } from './repositories/role.repository';
import { variantCostsRepository } from './repositories/variant-costs.repository';
import { TenantPaths } from './tenant-paths';

function transactionScope(t: Transaction, paths: TenantPaths): TransactionScope {
  return {
    tenant: tenantRepository(t, paths),
    audit: auditLogRepository(t, paths),
    members: membershipRepository(t, paths),
    invitations: invitationRepository(t, paths),
    roles: roleRepository(t, paths),
    products: productRepository(t, paths),
    variants: variantRepository(t, paths),
    costs: variantCostsRepository(t, paths),
    skuIndex: skuIndexRepository(t, paths),
  };
}

/** Todo lo que ocurre dentro de `run()` se confirma junto o no ocurre, dentro de UN comercio. */
export class FirestoreUnitOfWork implements UnitOfWork {
  private readonly paths: TenantPaths;

  constructor(
    private readonly db: Firestore,
    tenantId: TenantId,
  ) {
    this.paths = new TenantPaths(db, tenantId);
  }

  run<T>(work: (tx: TransactionScope) => Promise<T>): Promise<T> {
    return this.db.runTransaction((t) => work(transactionScope(t, this.paths)));
  }
}

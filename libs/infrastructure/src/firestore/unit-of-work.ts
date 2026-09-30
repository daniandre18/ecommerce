import type {
  AuditLogRepository,
  MembershipRepository,
  RoleRepository,
  TransactionScope,
  UnitOfWork,
  VariantCostsRepository,
} from '@ecommerce/application';
import type { Money, ProductId, RoleId, TenantId, VariantId } from '@ecommerce/domain';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { membershipFromDoc, membershipToDoc, roleFromDoc, roleToDoc } from './mappers';

export class RoleHasMembersError extends Error {
  override readonly name = 'RoleHasMembersError';
}

/**
 * Repositorios atados a UNA transacción y a UN comercio. El `tenantId` se fija al construir la
 * unidad de trabajo, así que ningún caso de uso puede construir una ruta de otro comercio: el
 * aislamiento es estructural también del lado del servidor (FR-002).
 */
class FirestoreScope implements TransactionScope {
  constructor(
    private readonly db: Firestore,
    private readonly t: Transaction,
    private readonly tenantId: TenantId,
  ) {}

  private col(name: string) {
    return this.db.collection(`tenants/${this.tenantId}/${name}`);
  }

  private costsDoc(productId: ProductId) {
    return this.db.doc(`tenants/${this.tenantId}/products/${productId}/private/costs`);
  }

  readonly audit: AuditLogRepository = {
    // `create` falla si el documento existe: ni por accidente se sobrescribe una entrada.
    append: async (entries) => {
      for (const e of entries) this.t.create(this.col('auditLog').doc(e.id), { ...e });
    },
  };

  readonly members: MembershipRepository = {
    findByUid: async (id) => {
      const snap = await this.t.get(this.col('members').doc(id));
      return snap.exists ? membershipFromDoc(snap.id, this.tenantId, snap.data()!) : null;
    },
    save: async (m) => {
      this.t.set(this.col('members').doc(m.uid), membershipToDoc(m));
    },
  };

  readonly roles: RoleRepository = {
    findById: async (id) => {
      const snap = await this.t.get(this.col('roles').doc(id));
      return snap.exists ? roleFromDoc(snap.id, this.tenantId, snap.data()!) : null;
    },
    list: async () => {
      const snap = await this.t.get(this.col('roles'));
      return snap.docs.map((d) => roleFromDoc(d.id, this.tenantId, d.data()));
    },
    save: async (r) => {
      this.t.set(this.col('roles').doc(r.id), roleToDoc(r));
    },
    delete: async (id: RoleId) => {
      const snap = await this.t.get(this.col('roles').doc(id));
      if (snap.exists && Number(snap.data()!['memberCount'] ?? 0) > 0) {
        throw new RoleHasMembersError(`El rol ${id} tiene miembros asignados (FR-013)`);
      }
      this.t.delete(this.col('roles').doc(id));
    },
  };

  readonly costs: VariantCostsRepository = {
    findByProduct: async (pid) => {
      const snap = await this.t.get(this.costsDoc(pid));
      return (snap.data()?.['costs'] ?? {}) as Record<VariantId, Money>;
    },
    setMany: async (pid, costs) => {
      this.t.set(this.costsDoc(pid), { costs: { ...costs }, updatedAt: new Date() }, { merge: true });
    },
  };
}

export class FirestoreUnitOfWork implements UnitOfWork {
  constructor(
    private readonly db: Firestore,
    private readonly tenantId: TenantId,
  ) {}

  run<T>(work: (tx: TransactionScope) => Promise<T>): Promise<T> {
    return this.db.runTransaction((t) => work(new FirestoreScope(this.db, t, this.tenantId)));
  }
}

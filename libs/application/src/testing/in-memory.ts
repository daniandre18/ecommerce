import type { AuditEntry, Membership, Money, ProductId, Role, RoleId, Uid, VariantId } from '@ecommerce/domain';
import type {
  AuditLogRepository,
  MembershipRepository,
  RoleRepository,
  VariantCostsRepository,
} from '../ports/repositories';
import type { TransactionScope, UnitOfWork } from '../ports/unit-of-work';

/**
 * Dobles en memoria de los puertos, para probar casos de uso sin emulador (principio X).
 * `run()` es transaccional de verdad: trabaja sobre una copia y solo la confirma si `work`
 * termina sin lanzar. Así las pruebas de atomicidad del dominio no dependen de Firestore.
 */
export class InMemoryStore {
  members = new Map<Uid, Membership>();
  roles = new Map<RoleId, Role>();
  audit: AuditEntry[] = [];
  costs = new Map<ProductId, Record<VariantId, Money>>();

  clone(): InMemoryStore {
    const c = new InMemoryStore();
    c.members = new Map(this.members);
    c.roles = new Map(this.roles);
    c.audit = [...this.audit];
    c.costs = new Map([...this.costs].map(([k, v]) => [k, { ...v }]));
    return c;
  }
}

class Scope implements TransactionScope {
  constructor(private readonly s: InMemoryStore) {}

  readonly audit: AuditLogRepository = {
    append: async (entries) => {
      this.s.audit.push(...entries);
    },
  };

  readonly members: MembershipRepository = {
    findByUid: async (uid) => this.s.members.get(uid) ?? null,
    save: async (m) => {
      this.s.members.set(m.uid, m);
    },
  };

  readonly roles: RoleRepository = {
    findById: async (id) => this.s.roles.get(id) ?? null,
    list: async () => [...this.s.roles.values()],
    save: async (r) => {
      this.s.roles.set(r.id, r);
    },
    delete: async (id) => {
      const role = this.s.roles.get(id);
      if (role && role.memberCount > 0) throw new Error(`El rol ${id} tiene miembros asignados`);
      this.s.roles.delete(id);
    },
  };

  readonly costs: VariantCostsRepository = {
    findByProduct: async (pid) => this.s.costs.get(pid) ?? {},
    setMany: async (pid, costs) => {
      this.s.costs.set(pid, { ...(this.s.costs.get(pid) ?? {}), ...costs });
    },
  };
}

export class InMemoryUnitOfWork implements UnitOfWork {
  constructor(public store: InMemoryStore = new InMemoryStore()) {}

  async run<T>(work: (tx: TransactionScope) => Promise<T>): Promise<T> {
    const draft = this.store.clone();
    const result = await work(new Scope(draft));
    this.store = draft; // solo se confirma si `work` no lanzó
    return result;
  }
}

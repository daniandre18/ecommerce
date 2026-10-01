import type { RoleRepository } from '@ecommerce/application';
import { assertCanDeleteRole } from '@ecommerce/domain';
import type { Transaction } from 'firebase-admin/firestore';
import { roleFromDoc, roleToDoc } from '../../mapping/team-mappers';
import type { TenantPaths } from '../tenant-paths';

export function roleRepository(t: Transaction, paths: TenantPaths): RoleRepository {
  const roles = paths.collection('roles');
  return {
    findById: async (id) => {
      const snap = await t.get(roles.doc(id));
      const data = snap.data();
      return data ? roleFromDoc(snap.id, paths.tenantId, data) : null;
    },
    list: async () => {
      const snap = await t.get(roles);
      return snap.docs.map((doc) => roleFromDoc(doc.id, paths.tenantId, doc.data()));
    },
    save: async (role) => {
      t.set(roles.doc(role.id), roleToDoc(role));
    },
    // La regla es del dominio; el repositorio la aplica para que ningún caso de uso pueda saltearla.
    delete: async (id) => {
      const ref = roles.doc(id);
      const data = (await t.get(ref)).data();
      if (!data) return;
      assertCanDeleteRole(roleFromDoc(id, paths.tenantId, data));
      t.delete(ref);
    },
  };
}

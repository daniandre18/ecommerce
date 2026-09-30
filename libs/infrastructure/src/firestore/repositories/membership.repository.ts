import type { MembershipRepository } from '@ecommerce/application';
import type { Transaction } from 'firebase-admin/firestore';
import { membershipFromDoc, membershipToDoc } from '../mappers';
import type { TenantPaths } from '../tenant-paths';

export function membershipRepository(t: Transaction, paths: TenantPaths): MembershipRepository {
  const members = paths.collection('members');
  return {
    findByUid: async (id) => {
      const snap = await t.get(members.doc(id));
      const data = snap.data();
      return data ? membershipFromDoc(snap.id, paths.tenantId, data) : null;
    },
    save: async (membership) => {
      t.set(members.doc(membership.uid), membershipToDoc(membership));
    },
  };
}

import type { MembershipRepository } from '@ecommerce/application';
import { normalizeEmail } from '@ecommerce/domain';
import type { Transaction } from 'firebase-admin/firestore';
import { membershipFromDoc, membershipToDoc } from '../../mapping/team-mappers';
import type { TenantPaths } from '../tenant-paths';

export function membershipRepository(t: Transaction, paths: TenantPaths): MembershipRepository {
  const members = paths.collection('members');
  return {
    findByUid: async (id) => {
      const snap = await t.get(members.doc(id));
      const data = snap.data();
      return data ? membershipFromDoc(snap.id, paths.tenantId, data) : null;
    },
    findByEmail: async (email) => {
      const found = await t.get(members.where('email', '==', normalizeEmail(email)).limit(1));
      const [first] = found.docs;
      return first ? membershipFromDoc(first.id, paths.tenantId, first.data()) : null;
    },
    save: async (membership) => {
      t.set(members.doc(membership.uid), membershipToDoc(membership));
    },
  };
}

import type { InvitationRepository } from '@ecommerce/application';
import { normalizeEmail } from '@ecommerce/domain';
import type { Transaction } from 'firebase-admin/firestore';
import { invitationFromDoc, invitationToDoc } from '../../mapping/team-mappers';
import type { TenantPaths } from '../tenant-paths';

export function invitationRepository(t: Transaction, paths: TenantPaths): InvitationRepository {
  const invitations = paths.collection('invitations');
  return {
    findById: async (id) => {
      const snap = await t.get(invitations.doc(id));
      const data = snap.data();
      return data ? invitationFromDoc(snap.id, paths.tenantId, data) : null;
    },
    findPendingByEmail: async (email) => {
      const found = await t.get(invitations.where('email', '==', normalizeEmail(email)).where('status', '==', 'pending').limit(1));
      const [first] = found.docs;
      return first ? invitationFromDoc(first.id, paths.tenantId, first.data()) : null;
    },
    save: async (invitation) => {
      t.set(invitations.doc(invitation.id), invitationToDoc(invitation));
    },
  };
}

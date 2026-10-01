import type { TeamQueries, Unsubscribe, Watcher } from '@ecommerce/application';
import type { Invitation, Membership, Role, TenantId } from '@ecommerce/domain';
import { collection, onSnapshot, query, where, type Firestore } from 'firebase/firestore';
import { invitationFromDoc, membershipFromDoc, roleFromDoc } from '../mapping/team-mappers';
import { deliver } from './deliver';

/** Lecturas del equipo. Las reglas dejan leer membresías e invitaciones solo al Propietario. */
export class FirestoreTeamQueries implements TeamQueries {
  constructor(private readonly db: Firestore) {}

  watchMembers(tenantId: TenantId, watcher: Watcher<readonly Membership[]>): Unsubscribe {
    return onSnapshot(
      collection(this.db, 'tenants', tenantId, 'members'),
      (snapshot) => deliver(watcher, () => snapshot.docs.map((d) => membershipFromDoc(d.id, tenantId, d.data()))),
      (error) => watcher.error(error),
    );
  }

  watchRoles(tenantId: TenantId, watcher: Watcher<readonly Role[]>): Unsubscribe {
    return onSnapshot(
      collection(this.db, 'tenants', tenantId, 'roles'),
      (snapshot) => deliver(watcher, () => snapshot.docs.map((d) => roleFromDoc(d.id, tenantId, d.data()))),
      (error) => watcher.error(error),
    );
  }

  watchInvitations(tenantId: TenantId, watcher: Watcher<readonly Invitation[]>): Unsubscribe {
    return onSnapshot(
      query(collection(this.db, 'tenants', tenantId, 'invitations'), where('status', '==', 'pending')),
      (snapshot) => deliver(watcher, () => snapshot.docs.map((d) => invitationFromDoc(d.id, tenantId, d.data()))),
      (error) => watcher.error(error),
    );
  }
}

import type { TeamQueries, Unsubscribe, Watcher } from '@ecommerce/application/client';
import type { Invitation, Membership, Role, TenantId } from '@ecommerce/domain';
import { collection, query, where, type Firestore } from 'firebase/firestore';
import { invitationFromDoc, membershipFromDoc, roleFromDoc } from '../mapping/team-mappers';
import { listenToQuery } from './listen';

/** Lecturas del equipo. Las reglas dejan leer membresías e invitaciones solo al Propietario. */
export class FirestoreTeamQueries implements TeamQueries {
  constructor(private readonly db: Firestore) {}

  watchMembers(tenantId: TenantId, watcher: Watcher<readonly Membership[]>): Unsubscribe {
    return listenToQuery(collection(this.db, 'tenants', tenantId, 'members'), watcher, (snapshot) => snapshot.docs.map((d) => membershipFromDoc(d.id, tenantId, d.data())));
  }

  watchRoles(tenantId: TenantId, watcher: Watcher<readonly Role[]>): Unsubscribe {
    return listenToQuery(collection(this.db, 'tenants', tenantId, 'roles'), watcher, (snapshot) => snapshot.docs.map((d) => roleFromDoc(d.id, tenantId, d.data())));
  }

  watchInvitations(tenantId: TenantId, watcher: Watcher<readonly Invitation[]>): Unsubscribe {
    return listenToQuery(query(collection(this.db, 'tenants', tenantId, 'invitations'), where('status', '==', 'pending')), watcher, (snapshot) => snapshot.docs.map((d) => invitationFromDoc(d.id, tenantId, d.data())));
  }
}

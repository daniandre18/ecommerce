import type { TenantAccess, TenantDirectory, Unsubscribe, Watcher } from '@ecommerce/application';
import { tenantId, type Uid } from '@ecommerce/domain';
import { collectionGroup, doc, getDoc, onSnapshot, query, where, type Firestore } from 'firebase/firestore';

/**
 * Consulta de grupo sobre las membresías de la cuenta, en todos los comercios. Las reglas solo la
 * permiten filtrada por el uid de quien consulta. El nombre de cada comercio se lee de su documento,
 * que es legible por sus miembros activos.
 */
export class FirestoreTenantDirectory implements TenantDirectory {
  constructor(private readonly db: Firestore) {}

  watchTenantsOf(uid: Uid, watcher: Watcher<readonly TenantAccess[]>): Unsubscribe {
    let latest = 0;
    return onSnapshot(
      query(collectionGroup(this.db, 'members'), where('uid', '==', uid)),
      (snapshot) => {
        const call = ++latest;
        const active = snapshot.docs.filter((membership) => membership.get('status') === 'active');
        Promise.all(
          active.map(async (membership) => {
            const id = membership.ref.parent.parent?.id ?? '';
            const tenant = await getDoc(doc(this.db, 'tenants', id));
            return { tenantId: tenantId(id), name: String(tenant.get('name') ?? id), isOwner: membership.get('isOwner') === true };
          }),
        )
          .then((tenants) => {
            // Si llegó otra versión de las membresías mientras se leían los nombres, gana la última.
            if (call === latest) watcher.next([...tenants].sort((a, b) => a.name.localeCompare(b.name)));
          })
          .catch((error: unknown) => watcher.error(error));
      },
      (error) => watcher.error(error),
    );
  }
}

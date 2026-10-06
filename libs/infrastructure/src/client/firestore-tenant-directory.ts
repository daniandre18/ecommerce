import type { TenantAccess, TenantDirectory, Unsubscribe, Watcher } from '@ecommerce/application/client';
import { isPermission, tenantId, type MemberAccess, type TenantId, type Uid } from '@ecommerce/domain';
import { collectionGroup, doc, getDoc, query, where, type DocumentSnapshot, type Firestore, type QuerySnapshot } from 'firebase/firestore';
import { listenToDoc, listenToQuery } from './listen';

/**
 * Consulta de grupo sobre las membresías de la cuenta, en todos los comercios. Las reglas solo la
 * permiten filtrada por el uid de quien consulta. El nombre de cada comercio se lee de su documento,
 * que es legible por sus miembros activos.
 */
export class FirestoreTenantDirectory implements TenantDirectory {
  constructor(private readonly db: Firestore) {}

  watchTenantsOf(uid: Uid, watcher: Watcher<readonly TenantAccess[]>): Unsubscribe {
    let latest = 0;
    const memberships = query(collectionGroup(this.db, 'members'), where('uid', '==', uid));
    const onMemberships: Watcher<QuerySnapshot> = {
      next: (snapshot) => {
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
      error: (error) => watcher.error(error),
    };
    return listenToQuery(memberships, onMemberships, (snapshot) => snapshot);
  }

  /**
   * Dos escuchas encadenadas: la membresía y, si no es la del Propietario, su rol. Al cambiar de
   * rol se corta la escucha del anterior. La cuenta siempre puede leer su propia membresía; el rol,
   * mientras la membresía esté activa, que es el único caso en que se escucha.
   */
  watchAccess(id: TenantId, uid: Uid, watcher: Watcher<MemberAccess | null>): Unsubscribe {
    let role: { readonly id: string; readonly stop: Unsubscribe } | undefined;
    const stopRole = () => {
      role?.stop();
      role = undefined;
    };
    const onMembership: Watcher<DocumentSnapshot> = {
      next: (membership) => {
        if (!membership.exists() || membership.get('status') !== 'active') {
          stopRole();
          watcher.next(null);
        } else if (membership.get('isOwner') === true) {
          stopRole();
          watcher.next({ isOwner: true, permissions: [] });
        } else {
          const roleId = String(membership.get('roleId'));
          if (role?.id === roleId) return;
          stopRole();
          role = {
            id: roleId,
            stop: listenToDoc(doc(this.db, 'tenants', id, 'roles', roleId), watcher, (snapshot) => ({
              isOwner: false,
              permissions: permissionsOf(snapshot.get('permissions')),
            })),
          };
        }
      },
      error: (error) => watcher.error(error),
    };
    const stopMembership = listenToDoc(doc(this.db, 'tenants', id, 'members', uid), onMembership, (snapshot) => snapshot);
    return () => {
      stopRole();
      stopMembership();
    };
  }
}

/** Un rol sin documento o con permisos que el panel no conoce no concede nada de más. */
function permissionsOf(value: unknown) {
  return Array.isArray(value) ? value.filter(isPermission) : [];
}

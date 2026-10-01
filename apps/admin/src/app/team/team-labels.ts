import type { Membership, Role, RoleId } from '@ecommerce/domain';

/** El nombre de un rol para mostrar; uno que ya no existe se nombra así, sin romper la vista. */
export function roleName(roles: readonly Role[], id: RoleId): string {
  return roles.find((role) => role.id === id)?.name ?? 'Rol eliminado';
}

/** Los roles que se pueden asignar o invitar: todos menos el de Propietario, que solo se traspasa. */
export function assignableRoles(roles: readonly Role[]): Role[] {
  return roles.filter((role) => role.preset !== 'owner').sort((a, b) => a.name.localeCompare(b.name));
}

/** Primero quien es Propietario, después las activas por nombre y al final las dadas de baja. */
export function sortMembers(members: readonly Membership[]): Membership[] {
  const rank = (m: Membership) => (m.isOwner ? 0 : m.status === 'active' ? 1 : 2);
  return [...members].sort((a, b) => rank(a) - rank(b) || a.displayName.localeCompare(b.displayName));
}

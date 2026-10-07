import type { Invitation, InvitationId, Membership, MembershipStatus, Permission, Role, RoleId, TenantId, Uid } from '@ecommerce/domain';
import type { CommandResult } from './commands';
import type { Unsubscribe, Watcher } from './queries';

/**
 * Lecturas del equipo, directas a Firestore. Las reglas las reservan al Propietario (membresías e
 * invitaciones); los roles los lee cualquier miembro activo. El panel las pide desde la vista de
 * equipo, que solo se ofrece al Propietario.
 */
export interface TeamQueries {
  /** Todas las membresías, también las dadas de baja: siguen nombradas en la bitácora (FR-031). */
  watchMembers(tenantId: TenantId, watcher: Watcher<readonly Membership[]>): Unsubscribe;
  watchRoles(tenantId: TenantId, watcher: Watcher<readonly Role[]>): Unsubscribe;
  /** Solo las pendientes; una pendiente puede estar vencida, y eso se calcula con `isExpired`. */
  watchInvitations(tenantId: TenantId, watcher: Watcher<readonly Invitation[]>): Unsubscribe;
}

type Done = Record<string, never>;

/** Las órdenes de equipo, una por callable (`contracts/callable-functions.md`). Todas escriben bitácora. */
export interface TeamCommands {
  createRole(tenantId: TenantId, input: { readonly name: string; readonly copyFrom?: RoleId }): Promise<CommandResult<{ readonly roleId: RoleId }>>;
  updateRole(
    tenantId: TenantId,
    input: { readonly roleId: RoleId; readonly name?: string; readonly permissions?: readonly Permission[] },
  ): Promise<CommandResult<Done>>;
  deleteRole(tenantId: TenantId, input: { readonly roleId: RoleId }): Promise<CommandResult<Done>>;
  /** El `token` es el enlace que la persona invitada abre: `{tenantId}/{invitationId}`. */
  inviteCollaborator(
    tenantId: TenantId,
    input: { readonly email: string; readonly roleId: RoleId },
  ): Promise<CommandResult<{ readonly invitationId: InvitationId; readonly token: string }>>;
  revokeInvitation(tenantId: TenantId, input: { readonly invitationId: InvitationId }): Promise<CommandResult<Done>>;
  /** El comercio viaja en el enlace: quien acepta todavía no es miembro de nada ahí. */
  acceptInvitation(token: string): Promise<CommandResult<{ readonly tenantId: TenantId; readonly roleId: RoleId }>>;
  assignRole(tenantId: TenantId, input: { readonly uid: Uid; readonly roleId: RoleId }): Promise<CommandResult<Done>>;
  setMembershipEnabled(
    tenantId: TenantId,
    input: { readonly uid: Uid; readonly enabled: boolean },
  ): Promise<CommandResult<{ readonly status: MembershipStatus }>>;
  transferOwnership(
    tenantId: TenantId,
    input: { readonly toUid: Uid; readonly newRoleIdForCurrentOwner: RoleId },
  ): Promise<CommandResult<{ readonly ownerUid: Uid }>>;
}

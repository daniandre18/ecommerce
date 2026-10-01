import {
  AcceptInvitation,
  AssignRole,
  CreateRole,
  DeleteRole,
  InviteCollaborator,
  RevokeInvitation,
  SetMembershipEnabled,
  TransferOwnership,
  UpdateRole,
} from '@ecommerce/application';
import { callableFactory, type CallableDependencies } from '../bootstrap/callable';
import {
  invitationTokenParts,
  parseAcceptInvitation,
  parseAssignRole,
  parseCreateRole,
  parseDeleteRole,
  parseInviteCollaborator,
  parseRevokeInvitation,
  parseSetMembershipEnabled,
  parseTransferOwnership,
  parseUpdateRole,
} from './parse';

/**
 * Equipo, roles y permisos (contracts/callable-functions.md). Todas exigen ser Propietario y no
 * existe permiso delegable que las habilite (FR-014), salvo aceptar una invitación. Todas escriben
 * bitácora en la misma transacción (FR-031a).
 */
export function teamCallables(deps: CallableDependencies) {
  const defineCallable = callableFactory(deps);
  const audited = { writesAudit: true };
  return {
    createRole: defineCallable('createRole', CreateRole, parseCreateRole, audited),
    updateRole: defineCallable('updateRole', UpdateRole, parseUpdateRole, audited),
    deleteRole: defineCallable('deleteRole', DeleteRole, parseDeleteRole, audited),
    inviteCollaborator: defineCallable('inviteCollaborator', InviteCollaborator, parseInviteCollaborator, audited),
    revokeInvitation: defineCallable('revokeInvitation', RevokeInvitation, parseRevokeInvitation, audited),
    // El comercio viene en el enlace: quien acepta todavía no es miembro de ninguno que pueda declarar.
    acceptInvitation: defineCallable('acceptInvitation', AcceptInvitation, parseAcceptInvitation, {
      ...audited,
      tenantFrom: (data) => invitationTokenParts(data)?.tenantId,
    }),
    assignRole: defineCallable('assignRole', AssignRole, parseAssignRole, audited),
    setMembershipEnabled: defineCallable('setMembershipEnabled', SetMembershipEnabled, parseSetMembershipEnabled, audited),
    transferOwnership: defineCallable('transferOwnership', TransferOwnership, parseTransferOwnership, audited),
  };
}

import type { CommandResult, TeamCommands } from '@ecommerce/application/client';
import type { TenantId } from '@ecommerce/domain';
import type { Functions } from 'firebase/functions';
import { callCommand } from './callable';

/** Las órdenes de equipo, una callable cada una. */
export class CallableTeamCommands implements TeamCommands {
  constructor(private readonly functions: Functions) {}

  createRole: TeamCommands['createRole'] = (tenantId, input) => this.call('createRole', tenantId, input);
  updateRole: TeamCommands['updateRole'] = (tenantId, input) => this.call('updateRole', tenantId, input);
  deleteRole: TeamCommands['deleteRole'] = (tenantId, input) => this.call('deleteRole', tenantId, input);
  inviteCollaborator: TeamCommands['inviteCollaborator'] = (tenantId, input) => this.call('inviteCollaborator', tenantId, input);
  revokeInvitation: TeamCommands['revokeInvitation'] = (tenantId, input) => this.call('revokeInvitation', tenantId, input);
  assignRole: TeamCommands['assignRole'] = (tenantId, input) => this.call('assignRole', tenantId, input);
  setMembershipEnabled: TeamCommands['setMembershipEnabled'] = (tenantId, input) => this.call('setMembershipEnabled', tenantId, input);
  transferOwnership: TeamCommands['transferOwnership'] = (tenantId, input) => this.call('transferOwnership', tenantId, input);

  /** Sin `tenantId`: el servidor lo saca del enlace. */
  acceptInvitation: TeamCommands['acceptInvitation'] = (token) => callCommand(this.functions, 'acceptInvitation', { invitationToken: token });

  private call<T>(name: string, tenantId: TenantId, input: object): Promise<CommandResult<T>> {
    return callCommand<T>(this.functions, name, { ...input, tenantId });
  }
}

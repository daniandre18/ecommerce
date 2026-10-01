import { allows, isActive, type Membership, type Permission } from '@ecommerce/domain';
import { NotAMemberError, PermissionDeniedError, type AuthorizationService } from '../ports/authorization';
import type { OperationContext } from '../ports/operation-context';
import type { TransactionScope } from '../ports/unit-of-work';

/**
 * Autorización por rol. Lee la membresía y el rol DENTRO de la transacción de la mutación, así que
 * una baja o un permiso retirado rige en la operación siguiente sin tocar tokens (FR-008), y una
 * baja concurrente no se cuela.
 *
 * Vive en `application` y no en `infrastructure` porque no tiene una sola línea de Firebase: solo
 * usa puertos. Eso permite probar el aislamiento de permisos sin emulador (principio X).
 */
export class RoleBasedAuthorizationService implements AuthorizationService {
  async assert(tx: TransactionScope, ctx: OperationContext, permission: Permission): Promise<void> {
    const member = await this.activeMember(tx, ctx);
    // Al Propietario no le hace falta su rol: se ahorra la lectura.
    const permissions = member.isOwner ? [] : ((await tx.roles.findById(member.roleId))?.permissions ?? []);
    if (!allows({ isOwner: member.isOwner, permissions }, permission)) {
      throw new PermissionDeniedError(`${ctx.actorUid} no tiene el permiso ${permission}`);
    }
  }

  async assertOwner(tx: TransactionScope, ctx: OperationContext): Promise<void> {
    const member = await this.activeMember(tx, ctx);
    if (!member.isOwner) {
      throw new PermissionDeniedError(`${ctx.actorUid} no es Propietario de ${ctx.tenantId}`);
    }
  }

  private async activeMember(tx: TransactionScope, ctx: OperationContext): Promise<Membership> {
    const member = await tx.members.findByUid(ctx.actorUid);
    if (!member) {
      throw new NotAMemberError(`${ctx.actorUid} no es miembro de ${ctx.tenantId}`);
    }
    if (!isActive(member)) {
      throw new PermissionDeniedError(`La membresía de ${ctx.actorUid} en ${ctx.tenantId} no está activa`);
    }
    return member;
  }
}

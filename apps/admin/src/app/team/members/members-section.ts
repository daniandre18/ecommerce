import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import type { CommandResult } from '@ecommerce/application/client';
import type { Membership, Role, RoleId, TenantId } from '@ecommerce/domain';
import { firstValueFrom } from 'rxjs';
import { TEAM_COMMANDS } from '../../core/client';
import { commandErrorMessage } from '../../shared/command-errors';
import { ConfirmDialog, type ConfirmData } from '../../shared/confirm-dialog';
import { assignableRoles, roleName, sortMembers } from '../team-labels';
import { TransferOwnershipDialog, type TransferOwnershipData } from './transfer-ownership-dialog';

/**
 * Las personas del comercio (T076): su rol, su estado y lo que el Propietario puede hacer con cada
 * una. Una baja es de la membresía en este comercio, no de la cuenta (FR-008a), y corta el acceso
 * en la operación siguiente; la persona sigue nombrada en la bitácora (FR-031).
 */
@Component({
  selector: 'app-members-section',
  imports: [MatButton, MatFormField, MatLabel, MatInput],
  template: `
    @if (onlyOwner()) {
      <p class="hint">Todavía no sumaste a nadie: invitá a tu equipo más abajo.</p>
    }
    <ul>
      @for (member of sorted(); track member.uid) {
        <li>
          <div class="row" role="group" [attr.aria-label]="member.displayName">
            <div class="who">
              <span class="name">{{ member.displayName }}</span>
              <span class="email">{{ member.email }}</span>
              <span class="meta">{{ member.isOwner ? 'Propietario' : nameOf(member.roleId) }} · {{ statusOf(member) }}</span>
            </div>
            @if (!member.isOwner) {
              <div class="actions">
                @if (member.status === 'active') {
                  <mat-form-field subscriptSizing="dynamic">
                    <mat-label>Rol</mat-label>
                    <select matNativeControl [attr.aria-label]="'Rol de ' + member.displayName" (change)="assign(member, $any($event.target))">
                      @for (role of assignable(); track role.id) {
                        <option [value]="role.id" [selected]="role.id === member.roleId">{{ role.name }}</option>
                      }
                    </select>
                  </mat-form-field>
                  <button matButton type="button" (click)="disable(member)">Dar de baja</button>
                  <button matButton type="button" (click)="transfer(member)">Hacer Propietario</button>
                } @else {
                  <button matButton type="button" (click)="enable(member)">Reactivar</button>
                }
              </div>
            }
          </div>
        </li>
      }
    </ul>
    <div role="alert" class="failure">{{ failure() }}</div>
  `,
  styles: `
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 12px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    .who {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .name {
      font: var(--mat-sys-title-small);
    }

    .email,
    .meta,
    .hint {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-medium);
      overflow-wrap: anywhere;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }

    .failure {
      color: var(--mat-sys-error);
    }

    .failure:empty {
      display: none;
    }
  `,
})
export class MembersSection {
  readonly tenantId = input.required<TenantId>();
  readonly members = input.required<readonly Membership[]>();
  readonly roles = input.required<readonly Role[]>();

  private readonly commands = inject(TEAM_COMMANDS);
  private readonly dialog = inject(MatDialog);
  private readonly announcer = inject(LiveAnnouncer);

  protected readonly sorted = computed(() => sortMembers(this.members()));
  protected readonly assignable = computed(() => assignableRoles(this.roles()));
  protected readonly onlyOwner = computed(() => this.members().every((member) => member.isOwner));
  protected readonly failure = signal('');

  protected nameOf(id: RoleId): string {
    return roleName(this.roles(), id);
  }

  protected statusOf(member: Membership): string {
    return member.status === 'active' ? 'Activa' : member.status === 'disabled' ? 'De baja' : 'Invitada';
  }

  protected async assign(member: Membership, select: HTMLSelectElement): Promise<void> {
    const role = this.assignable().find((candidate) => candidate.id === select.value);
    if (!role || role.id === member.roleId) return;
    const done = await this.run(this.commands.assignRole(this.tenantId(), { uid: member.uid, roleId: role.id }), `${member.displayName} ahora tiene el rol ${role.name}`);
    // Rechazado, el selector vuelve al rol que sigue vigente.
    if (!done) select.value = member.roleId;
  }

  protected async disable(member: Membership): Promise<void> {
    const data: ConfirmData = {
      title: `¿Dar de baja a ${member.displayName}?`,
      message: 'Pierde el acceso a este comercio de inmediato; sus otros comercios no cambian. Su nombre sigue en la bitácora y podés reactivarla cuando quieras.',
      confirm: 'Dar de baja',
    };
    const confirmed = await firstValueFrom(this.dialog.open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, { data }).afterClosed());
    if (!confirmed) return;
    await this.run(this.commands.setMembershipEnabled(this.tenantId(), { uid: member.uid, enabled: false }), `${member.displayName} quedó dada de baja`);
  }

  protected async enable(member: Membership): Promise<void> {
    await this.run(this.commands.setMembershipEnabled(this.tenantId(), { uid: member.uid, enabled: true }), `${member.displayName} volvió a tener acceso`);
  }

  protected async transfer(member: Membership): Promise<void> {
    const data: TransferOwnershipData = { name: member.displayName, roles: this.assignable() };
    const ref = this.dialog.open<TransferOwnershipDialog, TransferOwnershipData, RoleId | undefined>(TransferOwnershipDialog, { data });
    const roleId = await firstValueFrom(ref.afterClosed());
    if (!roleId) return;
    await this.run(
      this.commands.transferOwnership(this.tenantId(), { toUid: member.uid, newRoleIdForCurrentOwner: roleId }),
      `${member.displayName} ahora es Propietario del comercio`,
    );
  }

  private async run(command: Promise<CommandResult<unknown>>, done: string): Promise<boolean> {
    this.failure.set('');
    const result = await command;
    if (result.ok) {
      void this.announcer.announce(done);
    } else {
      this.failure.set(commandErrorMessage(result.code));
    }
    return result.ok;
  }
}

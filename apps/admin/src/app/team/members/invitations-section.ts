import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Clipboard } from '@angular/cdk/clipboard';
import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { email, form, FormField, required, submit } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { isExpired, type Invitation, type Role, type RoleId, type TenantId } from '@ecommerce/domain';
import { TEAM_COMMANDS } from '../../core/client';
import { commandErrorMessage } from '../../shared/command-errors';
import { assignableRoles, roleName } from '../team-labels';

const DATE = new Intl.DateTimeFormat('es', { dateStyle: 'medium' });

/** El rol con el que se invita si no se elige otro: el de Catálogo, pensado para eso (FR-016). */
function defaultRole(roles: readonly Role[]): RoleId | '' {
  return (roles.find((role) => role.preset === 'catalog') ?? roles[0])?.id ?? '';
}

/**
 * Invitar y seguir las invitaciones pendientes (T076, FR-006, FR-007). No hay correo saliente: la
 * invitación es un enlace que el Propietario comparte, y que solo puede aceptar una sesión con el
 * correo invitado. Invitar de nuevo a un correo pendiente renueva su invitación.
 */
@Component({
  selector: 'app-invitations-section',
  imports: [FormField, MatFormField, MatLabel, MatError, MatInput, MatButton],
  template: `
    <form novalidate (submit)="$event.preventDefault(); invite()" aria-label="Invitar">
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Correo de la persona</mat-label>
        <input matInput type="email" autocomplete="off" [formField]="inviteForm.email" />
        @if (inviteForm.email().errors()[0]; as error) {
          <mat-error>{{ error.message }}</mat-error>
        }
      </mat-form-field>
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Con el rol</mat-label>
        <select matNativeControl [formField]="inviteForm.roleId">
          @for (role of assignable(); track role.id) {
            <option [value]="role.id">{{ role.name }}</option>
          }
        </select>
      </mat-form-field>
      <button matButton="filled" type="submit" [disabled]="inviteForm().submitting()">Invitar</button>
    </form>
    <div role="alert" class="failure">{{ failure() }}</div>

    @if (lastInvite(); as sent) {
      <div class="link" role="status">
        <p>Compartí este enlace con {{ sent.email }}. Solo sirve para esa dirección y vence en 14 días.</p>
        <input matInput readonly aria-label="Enlace de la invitación" [value]="sent.link" />
        <button matButton type="button" (click)="copy(sent.link)">Copiar enlace</button>
      </div>
    }

    <h3 id="pendientes">Pendientes</h3>
    @if (pending().length === 0) {
      <p class="hint">No hay invitaciones pendientes.</p>
    } @else {
      <ul aria-labelledby="pendientes">
        @for (invitation of pending(); track invitation.id) {
          <li>
            <div class="row" role="group" [attr.aria-label]="invitation.email">
              <div class="who">
                <span class="name">{{ invitation.email }}</span>
                <span class="meta">{{ nameOf(invitation.roleId) }} · {{ expiryOf(invitation) }}</span>
              </div>
              <div class="actions">
                <button matButton type="button" (click)="copy(linkOf(invitation))">Copiar enlace</button>
                <button matButton type="button" (click)="revoke(invitation)">Revocar</button>
              </div>
            </div>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    form {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 8px;
    }

    form mat-form-field {
      flex: 1 1 200px;
    }

    form button {
      margin-top: 8px;
    }

    .link {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin: 12px 0;
      padding: 12px;
      border-radius: 12px;
      background: var(--mat-sys-surface-container);
    }

    .link p {
      flex-basis: 100%;
      margin: 0;
    }

    .link input {
      flex: 1 1 240px;
      min-width: 0;
      font: var(--mat-sys-body-medium);
    }

    h3 {
      margin: 16px 0 4px;
      font: var(--mat-sys-title-medium);
    }

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
      padding: 8px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    .who {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .name {
      overflow-wrap: anywhere;
    }

    .meta,
    .hint {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-medium);
    }

    .failure {
      color: var(--mat-sys-error);
    }

    .failure:empty {
      display: none;
    }
  `,
})
export class InvitationsSection {
  readonly tenantId = input.required<TenantId>();
  readonly invitations = input.required<readonly Invitation[]>();
  readonly roles = input.required<readonly Role[]>();

  private readonly commands = inject(TEAM_COMMANDS);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly clipboard = inject(Clipboard);
  private readonly origin = inject(DOCUMENT).location.origin;

  protected readonly assignable = computed(() => assignableRoles(this.roles()));
  protected readonly pending = computed(() => [...this.invitations()].sort((a, b) => a.email.localeCompare(b.email)));

  /** El rol elegido se conserva mientras exista; si lo eliminan, vuelve al de Catálogo. */
  protected readonly model = linkedSignal<readonly Role[], { email: string; roleId: string }>({
    source: this.assignable,
    computation: (roles, previous) =>
      previous && roles.some((role) => role.id === previous.value.roleId) ? previous.value : { email: previous?.value.email ?? '', roleId: defaultRole(roles) },
  });
  protected readonly inviteForm = form(this.model, (path) => {
    required(path.email, { message: 'Escribí el correo de la persona' });
    email(path.email, { message: 'Ese correo no parece válido' });
  });
  protected readonly failure = signal('');
  protected readonly lastInvite = signal<{ email: string; link: string } | undefined>(undefined);

  protected nameOf(id: RoleId): string {
    return roleName(this.roles(), id);
  }

  protected expiryOf(invitation: Invitation): string {
    return isExpired(invitation, new Date()) ? 'Vencida' : `Vence el ${DATE.format(invitation.expiresAt)}`;
  }

  protected linkOf(invitation: Invitation): string {
    return `${this.origin}/invitation/${this.tenantId()}/${invitation.id}`;
  }

  protected invite(): void {
    this.failure.set('');
    void submit(this.inviteForm, async () => {
      const { email: address, roleId } = this.model();
      const role = this.assignable().find((candidate) => candidate.id === roleId);
      if (!role) return undefined;
      const result = await this.commands.inviteCollaborator(this.tenantId(), { email: address.trim(), roleId: role.id });
      if (result.ok) {
        this.lastInvite.set({ email: address.trim(), link: `${this.origin}/invitation/${result.data.token}` });
        // Vacío y sin marcar como tocado: lista para la próxima, sin un error de "falta el correo".
        this.inviteForm.email().reset('');
        void this.announcer.announce(`Invitación creada para ${address.trim()}`);
      } else {
        this.failure.set(result.code === 'invalid-argument' ? `${address.trim()} ya es parte del equipo, o el correo no es válido.` : commandErrorMessage(result.code));
      }
      return undefined;
    });
  }

  protected async revoke(invitation: Invitation): Promise<void> {
    this.failure.set('');
    const result = await this.commands.revokeInvitation(this.tenantId(), { invitationId: invitation.id });
    if (result.ok) {
      void this.announcer.announce(`Invitación de ${invitation.email} revocada`);
    } else {
      this.failure.set(commandErrorMessage(result.code));
    }
  }

  protected copy(link: string): void {
    const copied = this.clipboard.copy(link);
    void this.announcer.announce(copied ? 'Enlace copiado' : 'No se pudo copiar: seleccioná el enlace y copialo a mano');
  }
}

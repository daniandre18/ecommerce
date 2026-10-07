import { Component, computed, inject, input, resource, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import type { CommandFailure } from '@ecommerce/application/client';
import { SignOut } from '../../auth/sign-out';
import { SESSION, TEAM_COMMANDS } from '../../core/client';
import { commandErrorMessage } from '../../shared/command-errors';

/** Por qué el servidor rechaza una invitación (`details.reason`, contracts/callable-functions.md). */
const REJECTIONS: Readonly<Record<string, string>> = {
  'email-mismatch': 'Esta invitación es para otro correo. Cerrá sesión y entrá con la cuenta a la que te invitaron.',
  'already-member': 'Ya sos parte de este comercio.',
  expired: 'La invitación venció. Pedile al Propietario del comercio que te invite de nuevo.',
  revoked: 'La invitación fue cancelada. Si es un error, pedile al Propietario que te invite de nuevo.',
  accepted: 'Esta invitación ya se usó.',
};

/**
 * El enlace de invitación: `/invitation/{tenantId}/{invitationId}` (T080). Exige sesión —quien no
 * tiene cuenta la crea desde el inicio de sesión y vuelve acá—, y no da acceso a nada hasta que se
 * acepta (FR-007). Si la cuenta ya está en otros comercios, se le suma este (FR-005).
 */
@Component({
  selector: 'app-accept-invitation',
  imports: [MatButton, RouterLink],
  template: `
    <h1>Te invitaron a un comercio</h1>
    @if (user.value(); as account) {
      <p>Vas a sumarte con la cuenta <strong>{{ account.email }}</strong>. El Propietario ya eligió qué vas a poder hacer.</p>
    }

    <div role="alert" class="failure">{{ failure() }}</div>

    @if (alreadyMember()) {
      <a matButton="filled" [routerLink]="['/t', tenantId()]">Entrar al comercio</a>
    } @else if (wrongAccount()) {
      <button matButton="filled" type="button" (click)="signOut.run()">Cerrar sesión</button>
    } @else {
      <button matButton="filled" type="button" [disabled]="accepting()" (click)="accept()">Aceptar invitación</button>
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: 480px;
      margin: 48px auto;
    }

    .failure:empty {
      display: none;
    }

    .failure {
      margin-bottom: 16px;
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-medium);
    }
  `,
})
export class AcceptInvitation {
  readonly tenantId = input.required<string>();
  readonly invitationId = input.required<string>();

  protected readonly signOut = inject(SignOut);
  private readonly commands = inject(TEAM_COMMANDS);
  private readonly session = inject(SESSION);
  private readonly router = inject(Router);

  protected readonly user = resource({ loader: () => this.session.current() });
  protected readonly accepting = signal(false);
  protected readonly failure = signal('');
  private readonly reason = signal<string | undefined>(undefined);
  protected readonly alreadyMember = computed(() => this.reason() === 'already-member');
  protected readonly wrongAccount = computed(() => this.reason() === 'email-mismatch');

  protected async accept(): Promise<void> {
    this.accepting.set(true);
    this.failure.set('');
    const result = await this.commands.acceptInvitation(`${this.tenantId()}/${this.invitationId()}`);
    this.accepting.set(false);
    if (result.ok) {
      await this.router.navigate(['/t', result.data.tenantId]);
      return;
    }
    const reason = reasonOf(result);
    this.reason.set(reason);
    this.failure.set((reason && REJECTIONS[reason]) ?? commandErrorMessage(result.code));
  }
}

function reasonOf(failure: CommandFailure): string | undefined {
  const reason = (failure.details as { reason?: unknown } | undefined)?.reason;
  return typeof reason === 'string' ? reason : undefined;
}

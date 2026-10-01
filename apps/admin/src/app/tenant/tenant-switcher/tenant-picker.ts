import { Component, effect, inject, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Router, RouterLink } from '@angular/router';
import { EmptyState, ErrorState, Skeleton } from '@ecommerce/ui';
import { SignOut } from '../../auth/sign-out';
import { MyTenants } from '../my-tenants';

/**
 * Después de entrar (T075): con un solo comercio, directo a su catálogo; con varios, se elige
 * (FR-005). Cambiar de comercio es navegar a otra ruta `/t/{tenantId}/…`: nada de la sesión cambia.
 */
@Component({
  selector: 'app-tenant-picker',
  imports: [RouterLink, MatButton, Skeleton, ErrorState, EmptyState],
  template: `
    <h1>Tus comercios</h1>
    @if (tenants.error()) {
      <ui-error-state heading="No pudimos cargar tus comercios" (retry)="tenants.reload()" />
    } @else if (tenants.hasValue()) {
      @if (tenants.value().length === 0) {
        <ui-empty-state
          heading="Tu cuenta no tiene comercios activos"
          message="Si te invitaron, aceptá la invitación desde el correo que recibiste."
        >
          <button matButton type="button" (click)="signOut.run()">Cerrar sesión</button>
        </ui-empty-state>
      } @else {
        <ul>
          @for (tenant of tenants.value(); track tenant.tenantId) {
            <li>
              <a [routerLink]="['/t', tenant.tenantId, 'catalog']">
                <span class="name">{{ tenant.name }}</span>
                <span class="role">{{ tenant.isOwner ? 'Propietario' : 'Colaboración' }}</span>
              </a>
            </li>
          }
        </ul>
        <button matButton type="button" (click)="signOut.run()">Cerrar sesión</button>
      }
    } @else {
      <ui-skeleton rows="2" rowHeight="64px" label="Cargando tus comercios…" />
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: 480px;
      margin: 32px auto;
    }

    h1 {
      font: var(--mat-sys-headline-small);
    }

    ul {
      margin: 0 0 16px;
      padding: 0;
      list-style: none;
    }

    a {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 64px;
      box-sizing: border-box;
      padding: 8px 12px;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      color: inherit;
      text-decoration: none;
    }

    a:hover .name {
      text-decoration: underline;
    }

    .name {
      font: var(--mat-sys-title-medium);
    }

    .role {
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class TenantPicker {
  private readonly router = inject(Router);
  protected readonly signOut = inject(SignOut);
  protected readonly tenants = inject(MyTenants).tenants;

  constructor() {
    // Con uno solo no hay nada que elegir; `replaceUrl`, para que "atrás" no vuelva a esta pantalla.
    effect(() => {
      const tenants = this.tenants.hasValue() ? this.tenants.value() : undefined;
      const only = tenants?.length === 1 ? tenants[0] : undefined;
      if (only) untracked(() => void this.router.navigate(['/t', only.tenantId, 'catalog'], { replaceUrl: true }));
    });
  }
}

import { Component, computed, inject, input, resource } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { RouterLink, RouterOutlet } from '@angular/router';
import { InvalidIdentifierError, tenantId, type MemberAccess, type Tenant, type TenantId, type Uid } from '@ecommerce/domain';
import { ErrorState } from '@ecommerce/ui';
import { SignOut } from '../../auth/sign-out';
import { CATALOG_QUERIES, SESSION, TENANT_DIRECTORY } from '../../core/client';
import { liveResource } from '../../shared/live-resource';
import { CURRENT_ACCESS } from '../current-access';
import { CURRENT_TENANT } from '../current-tenant';
import { MyTenants } from '../my-tenants';

/** El marco de todo lo que pasa dentro de un comercio: `/t/{tenantId}/…`. */
@Component({
  selector: 'app-tenant-shell',
  imports: [RouterOutlet, RouterLink, MatButton, ErrorState],
  providers: [
    { provide: CURRENT_TENANT, useFactory: () => inject(TenantShell).current },
    { provide: CURRENT_ACCESS, useFactory: () => inject(TenantShell).access },
  ],
  template: `
    <header>
      <p class="tenant">{{ name() }}</p>
      <nav aria-label="Cuenta">
        @if (canSwitch()) {
          <a matButton routerLink="/">Cambiar de comercio</a>
        }
        <button matButton type="button" (click)="signOut.run()">Cerrar sesión</button>
      </nav>
    </header>

    @if (noAccess()) {
      <ui-error-state
        heading="No pudimos abrir este comercio"
        message="Puede que no exista o que no tengas acceso. Revisá el código o pedile acceso a su Propietario."
        (retry)="tenant.reload()"
      />
    } @else {
      <router-outlet />
    }
  `,
  styles: `
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 48px;
      margin-bottom: 8px;
    }

    nav {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .tenant {
      margin: 0;
      font: var(--mat-sys-title-medium);
      overflow-wrap: anywhere;
    }
  `,
})
export class TenantShell {
  readonly tenantId = input.required<string>();

  protected readonly signOut = inject(SignOut);
  private readonly queries = inject(CATALOG_QUERIES);
  private readonly directory = inject(TENANT_DIRECTORY);
  private readonly session = inject(SESSION);
  private readonly myTenants = inject(MyTenants).tenants;

  private readonly id = computed(() => parseTenantId(this.tenantId()));
  protected readonly tenant = liveResource<Tenant | null, TenantId>({
    params: () => this.id(),
    subscribe: (id, watcher) => this.queries.watchTenant(id, watcher),
  });

  private readonly user = resource({ loader: () => this.session.current() });
  private readonly memberAccess = liveResource<MemberAccess | null, { tenantId: TenantId; uid: Uid }>({
    params: () => {
      const id = this.id();
      const uid = this.user.hasValue() ? this.user.value()?.uid : undefined;
      return id && uid ? { tenantId: id, uid } : undefined;
    },
    subscribe: ({ tenantId, uid }, watcher) => this.directory.watchAccess(tenantId, uid, watcher),
  });

  /** Con un solo comercio no hay a cuál cambiar. */
  protected readonly canSwitch = computed(() => (this.myTenants.hasValue() ? this.myTenants.value().length : 0) > 1);
  /** El comercio, para las vistas hijas (`CURRENT_TENANT`). */
  readonly current = computed(() => (this.tenant.hasValue() ? (this.tenant.value() ?? undefined) : undefined));
  /** Qué puede hacer la cuenta acá, para las vistas hijas (`CURRENT_ACCESS`); `undefined` mientras carga. */
  readonly access = computed(() => (this.memberAccess.hasValue() ? this.memberAccess.value() : undefined));
  /** Mientras carga, el nombre queda vacío y no empuja nada: el encabezado ya tiene su alto. */
  protected readonly name = computed(() => this.current()?.name ?? '');
  protected readonly noAccess = computed(
    () =>
      this.id() === undefined ||
      this.tenant.error() !== undefined ||
      (this.tenant.hasValue() && this.tenant.value() === null) ||
      this.access() === null,
  );
}

function parseTenantId(raw: string): TenantId | undefined {
  try {
    return tenantId(raw);
  } catch (error) {
    if (error instanceof InvalidIdentifierError) return undefined;
    throw error;
  }
}

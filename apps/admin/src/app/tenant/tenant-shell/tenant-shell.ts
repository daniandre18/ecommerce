import { Component, computed, inject, input, resource } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButton, MatMenu, MatMenuItem, MatMenuTrigger, ErrorState],
  providers: [
    { provide: CURRENT_TENANT, useFactory: () => inject(TenantShell).current },
    { provide: CURRENT_ACCESS, useFactory: () => inject(TenantShell).access },
  ],
  template: `
    <!--
      Dos filas de alto fijo: lo que llega después —el acceso de la cuenta, sus otros comercios— no
      cambia el alto del encabezado ni empuja la vista (SC-009). Las acciones de la cuenta van en un
      menú para que no compitan por el ancho de una pantalla de 360 px.
    -->
    <header>
      <p class="tenant">{{ name() }}</p>
      <button matButton type="button" class="account" [matMenuTriggerFor]="account">Cuenta</button>
      <mat-menu #account="matMenu">
        @if (canSwitch()) {
          <a mat-menu-item routerLink="/">Cambiar de comercio</a>
        }
        <button mat-menu-item type="button" (click)="signOut.run()">Cerrar sesión</button>
      </mat-menu>
      <nav aria-label="Secciones">
        <a matButton routerLink="catalog" routerLinkActive="active" ariaCurrentWhenActive="page">Catálogo</a>
        <a matButton routerLink="categories" routerLinkActive="active" ariaCurrentWhenActive="page">Categorías</a>
        <!-- Equipo y bitácora son solo del Propietario (FR-014, FR-034): a otra cuenta ni se le ofrecen. -->
        @if (access()?.isOwner) {
          <a matButton routerLink="team" routerLinkActive="active" ariaCurrentWhenActive="page">Equipo</a>
          <a matButton routerLink="audit" routerLinkActive="active" ariaCurrentWhenActive="page">Bitácora</a>
        }
      </nav>
    </header>

    @if (offline()) {
      <!-- Sin red no se sabe si hay acceso: decir "no tenés acceso" sería presentar un error como un hecho (FR-037). -->
      <ui-error-state
        heading="No pudimos conectarnos"
        message="Revisá tu conexión. Cuando vuelva, el comercio se abre solo."
        (retry)="tenant.reload(); memberAccess.reload()"
      />
    } @else if (noAccess()) {
      <ui-error-state
        heading="No pudimos abrir este comercio"
        message="Puede que no exista o que no tengas acceso. Revisá el código o pedile acceso a su Propietario."
        (retry)="tenant.reload(); memberAccess.reload()"
      />
    } @else {
      <router-outlet />
    }
  `,
  styles: `
    header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: 48px 48px;
      align-items: center;
      column-gap: 8px;
      margin-bottom: 8px;
    }

    .tenant {
      margin: 0;
      font: var(--mat-sys-title-medium);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    nav {
      grid-column: 1 / -1;
      display: flex;
      flex-wrap: nowrap;
      margin-inline: -12px;
    }

    .active {
      text-decoration: underline;
      text-underline-offset: 4px;
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
  protected readonly memberAccess = liveResource<MemberAccess | null, { tenantId: TenantId; uid: Uid }>({
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
  /** La lectura no llegó del servidor: `unavailable` es el código de Firestore y de `OfflineError`. */
  protected readonly offline = computed(() => [this.tenant.error(), this.memberAccess.error()].some((error) => isUnavailable(error)));
  protected readonly noAccess = computed(
    () =>
      this.id() === undefined ||
      this.tenant.error() !== undefined ||
      (this.tenant.hasValue() && this.tenant.value() === null) ||
      this.access() === null,
  );
}

function isUnavailable(error: Error | undefined): boolean {
  return error !== undefined && 'code' in error && error.code === 'unavailable';
}

function parseTenantId(raw: string): TenantId | undefined {
  try {
    return tenantId(raw);
  } catch (error) {
    if (error instanceof InvalidIdentifierError) return undefined;
    throw error;
  }
}

import { Component, computed, inject, input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { RouterOutlet } from '@angular/router';
import { InvalidIdentifierError, tenantId, type Tenant, type TenantId } from '@ecommerce/domain';
import { ErrorState } from '@ecommerce/ui';
import { SignOut } from '../../auth/sign-out';
import { CATALOG_QUERIES } from '../../core/client';
import { liveResource } from '../../shared/live-resource';

/** El marco de todo lo que pasa dentro de un comercio: `/t/{tenantId}/…`. */
@Component({
  selector: 'app-tenant-shell',
  imports: [RouterOutlet, MatButton, ErrorState],
  template: `
    <header>
      <p class="tenant">{{ name() }}</p>
      <button matButton type="button" (click)="signOut.run()">Cerrar sesión</button>
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

  private readonly id = computed(() => parseTenantId(this.tenantId()));
  protected readonly tenant = liveResource<Tenant | null, TenantId>({
    params: () => this.id(),
    subscribe: (id, watcher) => this.queries.watchTenant(id, watcher),
  });

  /** Mientras carga, el nombre queda vacío y no empuja nada: el encabezado ya tiene su alto. */
  protected readonly name = computed(() => (this.tenant.hasValue() ? (this.tenant.value()?.name ?? '') : ''));
  protected readonly noAccess = computed(
    () => this.id() === undefined || this.tenant.error() !== undefined || (this.tenant.hasValue() && this.tenant.value() === null),
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

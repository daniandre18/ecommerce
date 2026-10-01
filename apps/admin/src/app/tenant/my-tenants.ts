import { Injectable, inject, resource } from '@angular/core';
import type { TenantAccess } from '@ecommerce/application';
import type { Uid } from '@ecommerce/domain';
import { SESSION, TENANT_DIRECTORY } from '../core/client';
import { liveResource } from '../shared/live-resource';

/**
 * Los comercios de la cuenta con sesión, en tiempo real (T075). Una sola escucha para todo el
 * panel: la usan el selector y el marco de cada comercio. Al cerrar sesión la página se recarga, así
 * que no sobrevive a la cuenta.
 */
@Injectable({ providedIn: 'root' })
export class MyTenants {
  private readonly session = inject(SESSION);
  private readonly directory = inject(TENANT_DIRECTORY);

  private readonly user = resource({ loader: () => this.session.current() });
  readonly tenants = liveResource<readonly TenantAccess[], Uid>({
    params: () => (this.user.hasValue() ? this.user.value()?.uid : undefined),
    subscribe: (uid, watcher) => this.directory.watchTenantsOf(uid, watcher),
  });
}

import { Component, computed, inject, input } from '@angular/core';
import { tenantId, type Invitation, type Membership, type Role, type TenantId } from '@ecommerce/domain';
import { EmptyState, ErrorState, Skeleton } from '@ecommerce/ui';
import { TEAM_QUERIES } from '../core/client';
import { liveResource } from '../shared/live-resource';
import { CURRENT_ACCESS } from '../tenant/current-access';
import { InvitationsSection } from './members/invitations-section';
import { MembersSection } from './members/members-section';
import { RolesSection } from './roles/roles-section';

/** Ni llegó ni falló. */
const pending = (read: { hasValue(): boolean; error(): unknown }) => !read.hasValue() && read.error() === undefined;

/**
 * El equipo del comercio (T076): personas, invitaciones y roles, en tiempo real. Es solo del
 * Propietario (FR-014): a otra cuenta no se le piden las lecturas, que las reglas negarían igual.
 */
@Component({
  selector: 'app-team-page',
  imports: [Skeleton, ErrorState, EmptyState, MembersSection, InvitationsSection, RolesSection],
  template: `
    <h1>Equipo</h1>
    <!--
      Un solo esqueleto hasta que llegan las tres lecturas: si cada sección apareciera por su lado,
      una lista de personas más larga que su esqueleto empujaría las de abajo (SC-009).
    -->
    @if (access() === undefined || loading()) {
      <ui-skeleton rows="6" rowHeight="64px" label="Cargando el equipo…" />
    } @else if (!isOwner()) {
      <ui-empty-state heading="Solo el Propietario administra el equipo" message="Si necesitás un cambio, pedíselo a quien es Propietario del comercio." />
    } @else {
      <section aria-labelledby="personas">
        <h2 id="personas">Personas</h2>
        @if (members.error() || roles.error()) {
          <ui-error-state heading="No pudimos cargar el equipo" (retry)="members.reload(); roles.reload()" />
        } @else if (members.hasValue() && roles.hasValue()) {
          <app-members-section [tenantId]="id()" [members]="members.value()" [roles]="roles.value()" />
        }
      </section>

      <section aria-labelledby="invitaciones">
        <h2 id="invitaciones">Invitar</h2>
        @if (invitations.error() || roles.error()) {
          <ui-error-state heading="No pudimos cargar las invitaciones" (retry)="invitations.reload(); roles.reload()" />
        } @else if (invitations.hasValue() && roles.hasValue()) {
          <app-invitations-section [tenantId]="id()" [invitations]="invitations.value()" [roles]="roles.value()" />
        }
      </section>

      <section aria-labelledby="roles">
        <h2 id="roles">Roles</h2>
        @if (roles.error()) {
          <ui-error-state heading="No pudimos cargar los roles" (retry)="roles.reload()" />
        } @else if (roles.hasValue()) {
          <app-roles-section [tenantId]="id()" [roles]="roles.value()" />
        }
      </section>
    }
  `,
  styles: `
    h1 {
      margin: 0 0 8px;
      font: var(--mat-sys-headline-small);
    }

    h2 {
      margin: 24px 0 8px;
      font: var(--mat-sys-title-large);
    }
  `,
})
export class TeamPage {
  readonly tenantId = input.required<string>();

  private readonly queries = inject(TEAM_QUERIES);
  protected readonly access = inject(CURRENT_ACCESS);

  protected readonly id = computed(() => tenantId(this.tenantId()));
  protected readonly isOwner = computed(() => this.access()?.isOwner === true);
  /** Sin ser Propietario no se pide nada: ni siquiera se intenta lo que las reglas negarían. */
  private readonly ownedTenant = computed(() => (this.isOwner() ? this.id() : undefined));

  protected readonly members = liveResource<readonly Membership[], TenantId>({
    params: () => this.ownedTenant(),
    subscribe: (id, watcher) => this.queries.watchMembers(id, watcher),
  });
  protected readonly invitations = liveResource<readonly Invitation[], TenantId>({
    params: () => this.ownedTenant(),
    subscribe: (id, watcher) => this.queries.watchInvitations(id, watcher),
  });
  protected readonly roles = liveResource<readonly Role[], TenantId>({
    params: () => this.ownedTenant(),
    subscribe: (id, watcher) => this.queries.watchRoles(id, watcher),
  });

  /** Siendo Propietario, alguna lectura todavía no llegó ni falló. */
  protected readonly loading = computed(() => this.isOwner() && [this.members, this.invitations, this.roles].some(pending));
}

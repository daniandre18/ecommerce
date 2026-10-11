import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { PERMISSIONS, tenantId, type Permission, type Role, type TenantId } from '@ecommerce/domain';
import { EmptyState, ErrorState, Skeleton } from '@ecommerce/ui';
import { firstValueFrom } from 'rxjs';
import { TEAM_COMMANDS, TEAM_QUERIES } from '../../core/client';
import { commandErrorMessage } from '../../shared/command-errors';
import { ConfirmDialog, type ConfirmData } from '../../shared/confirm-dialog';
import { keepUnsaved } from '../../shared/keep-unsaved';
import { trackUnsaved } from '../../shared/pending-changes/pending-changes';
import { liveResource } from '../../shared/live-resource';
import { CURRENT_ACCESS } from '../../tenant/current-access';
import { PERMISSION_GROUPS, PERMISSION_LABELS } from './permission-labels';

/**
 * Los permisos como texto, en el orden del enumerado: dos conjuntos iguales son el mismo texto, así
 * el borrador sabe comparar lo guardado con lo que llega sin depender de referencias.
 */
const keyOf = (permissions: readonly Permission[]) => PERMISSIONS.filter((p) => permissions.includes(p)).join(' ');
const permissionsOf = (key: string): Permission[] => PERMISSIONS.filter((p) => key.split(' ').includes(p));

interface Draft {
  name: string;
  permissions: string;
}

/**
 * El editor de un rol (T077, FR-012): su nombre y sus permisos, elegidos solo entre los que existen.
 * Las credenciales, la facturación y la administración del equipo no aparecen porque no son
 * concesiones (FR-014). Un cambio rige en la operación siguiente de cada miembro (FR-008).
 */
@Component({
  selector: 'app-role-editor',
  imports: [FormField, MatFormField, MatLabel, MatError, MatInput, MatButton, MatCheckbox, RouterLink, Skeleton, ErrorState, EmptyState],
  template: `
    <a class="back" [routerLink]="teamLink()">← Equipo</a>

    @if (access() === undefined) {
      <ui-skeleton rows="4" label="Cargando el rol…" />
    } @else if (!access()?.isOwner) {
      <ui-empty-state heading="Solo el Propietario administra los roles" message="Si necesitás un cambio, pedíselo a quien es Propietario del comercio." />
    } @else if (roles.error()) {
      <ui-error-state heading="No pudimos cargar el rol" [retrying]="roles.status() === 'reloading'" (retry)="roles.reload()" />
    } @else if (!roles.hasValue()) {
      <ui-skeleton rows="4" label="Cargando el rol…" />
    } @else if (role(); as current) {
      <h1>{{ current.name }}</h1>
      @if (!current.editable) {
        <p class="note">El rol Propietario puede todo en el comercio y no se edita. Para cambiar quién es Propietario, traspasá la propiedad desde Equipo.</p>
      } @else {
        <form novalidate (submit)="$event.preventDefault(); save()">
          <mat-form-field>
            <mat-label>Nombre</mat-label>
            <input matInput autocomplete="off" [formField]="roleForm.name" />
            @if (roleForm.name().errors()[0]; as error) {
              <mat-error>{{ error.message }}</mat-error>
            }
          </mat-form-field>

          @for (group of groups; track group.heading) {
            <fieldset>
              <legend>{{ group.heading }}</legend>
              @for (permission of group.permissions; track permission) {
                <mat-checkbox [checked]="has(permission)" (change)="toggle(permission, $event.checked)">
                  <span class="label">{{ labels[permission].label }}</span>
                  <span class="hint">{{ labels[permission].hint }}</span>
                </mat-checkbox>
              }
            </fieldset>
          }

          <div role="alert" class="failure">{{ failure() }}</div>
          @if (dirty()) {
            <div class="actions">
              <button matButton type="button" (click)="discard()">Descartar cambios</button>
              <button matButton="filled" type="submit" [disabled]="roleForm().submitting()">Guardar rol</button>
            </div>
          }
        </form>

        <section aria-labelledby="eliminar">
          <h2 id="eliminar">Eliminar el rol</h2>
          @if (current.memberCount > 0) {
            <p class="note">
              {{ current.memberCount === 1 ? 'Lo tiene 1 persona' : 'Lo tienen ' + current.memberCount + ' personas' }}: asignales otro rol antes de
              eliminarlo.
            </p>
          }
          <button matButton="outlined" type="button" [disabled]="current.memberCount > 0" (click)="remove(current)">Eliminar rol</button>
        </section>
      }
    } @else {
      <ui-empty-state heading="Este rol no existe" message="Puede que lo hayan eliminado." />
    }
  `,
  styles: `
    /* Zona táctil de 48 px, como los botones de Material (T095). */
    .back {
      display: inline-flex;
      align-items: center;
      min-height: 48px;
    }

    h1 {
      margin: 0 0 16px;
      font: var(--mat-sys-headline-small);
    }

    h2 {
      margin: 24px 0 8px;
      font: var(--mat-sys-title-medium);
    }

    mat-form-field {
      display: block;
    }

    fieldset {
      margin: 0 0 16px;
      padding: 0;
      border: 0;
    }

    legend {
      margin-bottom: 4px;
      font: var(--mat-sys-title-small);
    }

    mat-checkbox {
      display: block;
    }

    .label {
      display: block;
    }

    .hint,
    .note {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-medium);
    }

    .actions {
      display: flex;
      justify-content: flex-end;
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
export class RoleEditor {
  readonly tenantId = input.required<string>();
  readonly roleId = input.required<string>();

  private readonly queries = inject(TEAM_QUERIES);
  private readonly commands = inject(TEAM_COMMANDS);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly announcer = inject(LiveAnnouncer);
  protected readonly access = inject(CURRENT_ACCESS);

  protected readonly groups = PERMISSION_GROUPS;
  protected readonly labels = PERMISSION_LABELS;
  private readonly id = computed(() => tenantId(this.tenantId()));
  protected readonly teamLink = computed(() => ['/t', this.tenantId(), 'team']);

  protected readonly roles = liveResource<readonly Role[], TenantId>({
    params: () => (this.access()?.isOwner ? this.id() : undefined),
    subscribe: (id, watcher) => this.queries.watchRoles(id, watcher),
  });
  protected readonly role = computed(() => (this.roles.hasValue() ? this.roles.value().find((role) => role.id === this.roleId()) : undefined));

  private readonly stored = computed<Draft>(() => {
    const role = this.role();
    return { name: role?.name ?? '', permissions: keyOf(role?.permissions ?? []) };
  });
  /** Lo cambiado y sin guardar se conserva si otro cambia el rol; lo demás sigue a lo guardado. */
  protected readonly draft = linkedSignal<Draft, Draft>({ source: this.stored, computation: keepUnsaved });
  protected readonly roleForm = form(this.draft, (path) => {
    required(path.name, { message: 'El rol necesita un nombre' });
  });
  protected readonly dirty = computed(() => {
    const [draft, stored] = [this.draft(), this.stored()];
    return draft.name.trim() !== stored.name || draft.permissions !== stored.permissions;
  });
  protected readonly failure = signal('');

  constructor() {
    trackUnsaved(() => this.role()?.editable === true && this.dirty());
  }

  protected has(permission: Permission): boolean {
    return permissionsOf(this.draft().permissions).includes(permission);
  }

  protected toggle(permission: Permission, granted: boolean): void {
    this.draft.update((draft) => {
      const current = permissionsOf(draft.permissions).filter((p) => p !== permission);
      return { ...draft, permissions: keyOf(granted ? [...current, permission] : current) };
    });
  }

  protected discard(): void {
    this.draft.set(this.stored());
    this.failure.set('');
  }

  protected save(): void {
    this.failure.set('');
    void submit(this.roleForm, async () => {
      const role = this.role();
      if (!role) return undefined;
      const [draft, stored] = [this.draft(), this.stored()];
      const name = draft.name.trim();
      const result = await this.commands.updateRole(this.id(), {
        roleId: role.id,
        ...(name !== stored.name ? { name } : {}),
        ...(draft.permissions !== stored.permissions ? { permissions: permissionsOf(draft.permissions) } : {}),
      });
      if (result.ok) {
        void this.announcer.announce(`Rol ${name} guardado`);
      } else {
        this.failure.set(result.code === 'invalid-argument' ? `Ya hay un rol llamado «${name}».` : commandErrorMessage(result.code));
      }
      return undefined;
    });
  }

  protected async remove(role: Role): Promise<void> {
    const data: ConfirmData = {
      title: `¿Eliminar el rol ${role.name}?`,
      message: 'Nadie lo tiene asignado. Los cambios que ya quedaron en la bitácora lo siguen nombrando.',
      confirm: 'Eliminar rol',
    };
    const confirmed = await firstValueFrom(this.dialog.open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, { data }).afterClosed());
    if (!confirmed) return;
    this.failure.set('');
    const result = await this.commands.deleteRole(this.id(), { roleId: role.id });
    if (result.ok) {
      void this.announcer.announce(`Rol ${role.name} eliminado`);
      await this.router.navigate(this.teamLink());
    } else {
      this.failure.set(result.code === 'invalid-argument' ? 'Alguien tiene este rol: asignale otro antes de eliminarlo.' : commandErrorMessage(result.code));
    }
  }
}

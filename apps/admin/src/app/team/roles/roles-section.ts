import { Component, computed, inject, input, signal } from '@angular/core';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import type { Role, TenantId } from '@ecommerce/domain';
import { TEAM_COMMANDS } from '../../core/client';
import { commandErrorMessage } from '../../shared/command-errors';

/**
 * Los roles del comercio y la creación de uno propio (T077). Un rol nuevo nace sin permisos
 * (FR-009), o con los de otro como punto de partida; los permisos se eligen en su editor.
 */
@Component({
  selector: 'app-roles-section',
  imports: [FormField, MatFormField, MatLabel, MatError, MatInput, MatButton, RouterLink],
  template: `
    <ul>
      @for (role of sorted(); track role.id) {
        <li>
          <a [routerLink]="['roles', role.id]">
            <span class="name">{{ role.name }}</span>
            <span class="meta">{{ countOf(role) }}{{ role.preset ? ' · Predefinido' : '' }}</span>
          </a>
        </li>
      }
    </ul>

    <form novalidate (submit)="$event.preventDefault(); create()" aria-label="Nuevo rol">
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Nombre del rol nuevo</mat-label>
        <input matInput autocomplete="off" [formField]="roleForm.name" />
        @if (roleForm.name().errors()[0]; as error) {
          <mat-error>{{ error.message }}</mat-error>
        }
      </mat-form-field>
      <mat-form-field subscriptSizing="dynamic">
        <mat-label>Empezar con los permisos de</mat-label>
        <select matNativeControl [formField]="roleForm.copyFrom">
          <option value="">Ninguno: sin permisos</option>
          @for (role of copyable(); track role.id) {
            <option [value]="role.id">{{ role.name }}</option>
          }
        </select>
      </mat-form-field>
      <button matButton="filled" type="submit" [disabled]="roleForm().submitting()">Crear rol</button>
    </form>
    <div role="alert" class="failure">{{ failure() }}</div>
  `,
  styles: `
    ul {
      margin: 0 0 16px;
      padding: 0;
      list-style: none;
    }

    a {
      display: flex;
      flex-direction: column;
      min-height: 48px;
      justify-content: center;
      padding: 8px 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      color: inherit;
      text-decoration: none;
    }

    .name {
      font: var(--mat-sys-title-small);
    }

    .meta {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-medium);
    }

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

    .failure {
      color: var(--mat-sys-error);
    }

    .failure:empty {
      display: none;
    }
  `,
})
export class RolesSection {
  readonly tenantId = input.required<TenantId>();
  readonly roles = input.required<readonly Role[]>();

  private readonly commands = inject(TEAM_COMMANDS);
  private readonly router = inject(Router);

  /** Propietario primero, después los predefinidos y los propios, cada grupo por nombre. */
  protected readonly sorted = computed(() => {
    const rank = (role: Role) => (role.preset === 'owner' ? 0 : role.preset ? 1 : 2);
    return [...this.roles()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  });
  /** Los del Propietario no se copian: su rol no concede nada, puede todo por ser Propietario. */
  protected readonly copyable = computed(() => this.sorted().filter((role) => role.preset !== 'owner'));

  protected readonly model = signal({ name: '', copyFrom: '' });
  protected readonly roleForm = form(this.model, (path) => {
    required(path.name, { message: 'Dale un nombre al rol' });
  });
  protected readonly failure = signal('');

  protected countOf(role: Role): string {
    return role.memberCount === 1 ? '1 persona' : `${role.memberCount} personas`;
  }

  protected create(): void {
    this.failure.set('');
    void submit(this.roleForm, async () => {
      const { name, copyFrom } = this.model();
      const source = this.copyable().find((role) => role.id === copyFrom);
      const result = await this.commands.createRole(this.tenantId(), { name: name.trim(), ...(source ? { copyFrom: source.id } : {}) });
      if (result.ok) {
        await this.router.navigate(['/t', this.tenantId(), 'team', 'roles', result.data.roleId]);
      } else {
        this.failure.set(result.code === 'invalid-argument' ? `Ya hay un rol llamado «${name.trim()}».` : commandErrorMessage(result.code));
      }
      return undefined;
    });
  }
}

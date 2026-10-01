import { LiveAnnouncer } from '@angular/cdk/a11y';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { PERMISSIONS, type Role } from '@ecommerce/domain';
import { of } from 'rxjs';
import { TEAM_COMMANDS, TEAM_QUERIES } from '../../core/client';
import { CATALOG_ACCESS, customRole, fakeTeamCommands, FakeTeamQueries, presetRolesOfT1, provideAccess, T1, useAccess } from '../../../testing/fakes';
import { settle } from '../../../testing/settle';
import { PERMISSION_LABELS } from './permission-labels';
import { RoleEditor } from './role-editor';

// T077 — el editor de permisos: solo existen los del enumerado (FR-012, FR-014).
describe('RoleEditor', () => {
  let queries: FakeTeamQueries;
  let commands: ReturnType<typeof fakeTeamCommands>;
  const dialog = { open: vi.fn() };
  const announcer = { announce: vi.fn(async () => undefined) };
  const empty: Role = customRole('deposito', 'Depósito');

  beforeEach(() => {
    queries = new FakeTeamQueries();
    commands = fakeTeamCommands();
    dialog.open.mockReset();
    announcer.announce.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 't/:tenantId/team/roles/:roleId', component: RoleEditor }, { path: '**', children: [] }], withComponentInputBinding()),
        provideAccess(),
        { provide: TEAM_QUERIES, useValue: queries },
        { provide: TEAM_COMMANDS, useValue: commands },
        { provide: MatDialog, useValue: dialog },
        { provide: LiveAnnouncer, useValue: announcer },
      ],
    });
  });

  async function open(role: Role = empty) {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/t/t1/team/roles/${role.id}`);
    await settle();
    queries.roles[0]?.emit([...presetRolesOfT1({ catalog: 2 }), empty]);
    await settle();
    const root = harness.routeNativeElement as HTMLElement;
    const checkbox = (label: string) => {
      const box = [...root.querySelectorAll('mat-checkbox')].find((c) => c.querySelector('.label')?.textContent?.trim() === label);
      const input = box?.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (!input) throw new Error(`No hay casilla «${label}»`);
      return input;
    };
    const button = (text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
    return { root, checkbox, button };
  }

  it('ofrece exactamente los permisos del enumerado: ni credenciales, ni facturación, ni administrar roles', async () => {
    const { root } = await open();
    const labels = [...root.querySelectorAll('mat-checkbox .label')].map((l) => l.textContent?.trim());
    expect(labels.sort()).toEqual(PERMISSIONS.map((p) => PERMISSION_LABELS[p].label).sort());
    expect(root.textContent).not.toMatch(/credencial|pasarela|factura|suscripci|administrar roles/i);
  });

  it('un rol nuevo no tiene ninguno marcado (FR-009)', async () => {
    const { root } = await open();
    expect([...root.querySelectorAll<HTMLInputElement>('mat-checkbox input')].some((input) => input.checked)).toBe(false);
  });

  it('guarda solo lo que cambió: acá, los permisos y no el nombre', async () => {
    commands.updateRole.mockResolvedValue({ ok: true, data: {} });
    const { checkbox, button } = await open();
    checkbox('Cambiar precios').click();
    checkbox('Editar el catálogo').click();
    await settle();
    button('Guardar rol')?.click();
    await settle();
    expect(commands.updateRole).toHaveBeenCalledWith(T1, { roleId: 'deposito', permissions: ['catalog.write', 'variant.price.write'] });
    expect(announcer.announce).toHaveBeenCalledWith('Rol Depósito guardado');
  });

  it('descartar vuelve a lo guardado', async () => {
    const { checkbox, button } = await open();
    checkbox('Ver el costo').click();
    await settle();
    button('Descartar cambios')?.click();
    await settle();
    expect(checkbox('Ver el costo').checked).toBe(false);
    expect(button('Guardar rol')).toBeUndefined();
  });

  it('el rol Propietario no se edita (FR-016)', async () => {
    const { root } = await open(presetRolesOfT1()[0]);
    expect(root.textContent).toContain('El rol Propietario puede todo en el comercio y no se edita');
    expect(root.querySelector('mat-checkbox')).toBeNull();
  });

  it('con personas asignadas no se elimina (FR-013)', async () => {
    const { root, button } = await open(presetRolesOfT1()[1]);
    expect(root.textContent).toContain('Lo tienen 2 personas: asignales otro rol antes de eliminarlo.');
    expect(button('Eliminar rol')?.disabled).toBe(true);
  });

  it('sin personas se elimina, con confirmación, y vuelve al equipo', async () => {
    commands.deleteRole.mockResolvedValue({ ok: true, data: {} });
    dialog.open.mockReturnValue({ afterClosed: () => of(true) });
    const { button } = await open();
    button('Eliminar rol')?.click();
    await settle();
    expect(commands.deleteRole).toHaveBeenCalledWith(T1, { roleId: 'deposito' });
    expect(TestBed.inject(Router).url).toBe('/t/t1/team');
  });

  it('a quien no es Propietario no se le ofrece, ni se piden los roles', async () => {
    useAccess(CATALOG_ACCESS);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/t/t1/team/roles/catalog');
    await settle();
    expect((harness.routeNativeElement as HTMLElement).textContent).toContain('Solo el Propietario administra los roles');
    expect(queries.roles).toEqual([]);
  });
});

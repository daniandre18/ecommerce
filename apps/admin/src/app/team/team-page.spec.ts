import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TEAM_COMMANDS, TEAM_QUERIES } from '../core/client';
import { CATALOG_ACCESS, fakeTeamCommands, FakeTeamQueries, member, presetRolesOfT1, provideAccess, useAccess } from '../../testing/fakes';
import { settle } from '../../testing/settle';
import { TeamPage } from './team-page';

// T076 — la vista de equipo, con esqueleto, error y vacío en cada sección (SC-012).
describe('TeamPage', () => {
  let queries: FakeTeamQueries;

  beforeEach(() => {
    queries = new FakeTeamQueries();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 't/:tenantId/team', component: TeamPage }], withComponentInputBinding()),
        provideAccess(),
        { provide: TEAM_QUERIES, useValue: queries },
        { provide: TEAM_COMMANDS, useValue: fakeTeamCommands() },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    });
  });

  async function open() {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/t/t1/team');
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }

  it('pide personas, invitaciones y roles del comercio, con un esqueleto por sección mientras llegan', async () => {
    const root = await open();
    expect([queries.members, queries.invitations, queries.roles].map((list) => list.map((s) => s.params))).toEqual([['t1'], ['t1'], ['t1']]);
    expect(root.querySelectorAll('ui-skeleton')).toHaveLength(3);

    queries.members[0]?.emit([member('owner', 'Dueña', 'owner', { isOwner: true }), member('ana', 'Ana', 'catalog')]);
    queries.invitations[0]?.emit([]);
    queries.roles[0]?.emit(presetRolesOfT1({ catalog: 1 }));
    await settle();
    expect(root.querySelector('ui-skeleton')).toBeNull();
    expect(root.querySelector('app-members-section')?.textContent).toContain('Ana');
    expect(root.querySelector('app-invitations-section')?.textContent).toContain('No hay invitaciones pendientes');
    expect(root.querySelector('app-roles-section')?.textContent).toContain('Catálogo');
  });

  it('si falla una lectura, esa sección lo dice y permite reintentar; las demás siguen', async () => {
    const root = await open();
    queries.members[0]?.fail(new Error('sin red'));
    queries.invitations[0]?.emit([]);
    queries.roles[0]?.emit(presetRolesOfT1());
    await settle();
    expect(root.querySelector('[aria-labelledby="personas"] ui-error-state')).not.toBeNull();
    expect(root.querySelector('app-roles-section')).not.toBeNull();

    root.querySelector<HTMLButtonElement>('[aria-labelledby="personas"] ui-error-state button')?.click();
    await settle();
    expect(queries.members.filter((s) => !s.closed)).toHaveLength(1);
    expect(queries.members).toHaveLength(2);
  });

  it('a quien no es Propietario no se le muestra ni se le pide nada del equipo (FR-014)', async () => {
    useAccess(CATALOG_ACCESS);
    const root = await open();
    expect(root.textContent).toContain('Solo el Propietario administra el equipo');
    expect([...queries.members, ...queries.invitations, ...queries.roles]).toEqual([]);
  });
});

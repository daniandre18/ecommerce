import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { Role } from '@ecommerce/domain';
import { TEAM_COMMANDS } from '../../core/client';
import { customRole, fakeTeamCommands, presetRolesOfT1, T1 } from '../../../testing/fakes';
import { settle } from '../../../testing/settle';
import { RolesSection } from './roles-section';

// T077 — los roles del comercio y la creación de uno propio (FR-009).
describe('RolesSection', () => {
  let commands: ReturnType<typeof fakeTeamCommands>;
  const precios: Role = customRole('precios', 'Precios', { permissions: ['variant.price.write'], memberCount: 1 });

  beforeEach(() => {
    commands = fakeTeamCommands();
    TestBed.configureTestingModule({
      imports: [RolesSection],
      providers: [provideRouter([{ path: '**', children: [] }]), { provide: TEAM_COMMANDS, useValue: commands }],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(RolesSection);
    fixture.componentRef.setInput('tenantId', T1);
    fixture.componentRef.setInput('roles', [precios, ...presetRolesOfT1({ catalog: 2 })]);
    await settle();
    const root = fixture.nativeElement as HTMLElement;
    const create = async (name: string, copyFrom = '') => {
      const input = root.querySelector<HTMLInputElement>('form input');
      const select = root.querySelector<HTMLSelectElement>('form select');
      if (!input || !select) throw new Error('No está el formulario');
      input.value = name;
      input.dispatchEvent(new Event('input'));
      select.value = copyFrom;
      select.dispatchEvent(new Event('input'));
      root.querySelector('form')?.dispatchEvent(new Event('submit'));
      await settle();
    };
    return { root, create };
  }

  it('lista primero el de Propietario, después los predefinidos y los propios, con cuántas personas los tienen', async () => {
    const { root } = await render();
    const rows = [...root.querySelectorAll('li a')].map((a) => [a.querySelector('.name')?.textContent, a.querySelector('.meta')?.textContent]);
    expect(rows).toEqual([
      ['Propietario', '1 persona · Predefinido'],
      ['Catálogo', '2 personas · Predefinido'],
      ['Precios', '1 persona'],
    ]);
    expect(root.querySelector('li a')?.getAttribute('href')).toBe('/roles/owner');
  });

  it('crea un rol sin permisos y abre su editor', async () => {
    commands.createRole.mockResolvedValue({ ok: true, data: { roleId: 'nuevo' } });
    const { create } = await render();
    await create(' Depósito ');
    expect(commands.createRole).toHaveBeenCalledWith(T1, { name: 'Depósito' });
    expect(TestBed.inject(Router).url).toBe('/t/t1/team/roles/nuevo');
  });

  it('puede partir de los permisos de otro rol, salvo del de Propietario', async () => {
    commands.createRole.mockResolvedValue({ ok: true, data: { roleId: 'nuevo' } });
    const { root, create } = await render();
    expect([...root.querySelectorAll('form option')].map((o) => o.textContent)).toEqual(['Ninguno: sin permisos', 'Catálogo', 'Precios']);
    await create('Catálogo y precios', 'catalog');
    expect(commands.createRole).toHaveBeenCalledWith(T1, { name: 'Catálogo y precios', copyFrom: 'catalog' });
  });

  it('un nombre repetido se explica', async () => {
    commands.createRole.mockResolvedValue({ ok: false, code: 'invalid-argument', message: '' });
    const { root, create } = await render();
    await create('Precios');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Ya hay un rol llamado «Precios»');
  });
});

import { LiveAnnouncer } from '@angular/cdk/a11y';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import type { Membership } from '@ecommerce/domain';
import { of } from 'rxjs';
import { TEAM_COMMANDS } from '../../core/client';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { fakeTeamCommands, member, presetRolesOfT1, T1 } from '../../../testing/fakes';
import { settle } from '../../../testing/settle';
import { MembersSection } from './members-section';
import { TransferOwnershipDialog } from './transfer-ownership-dialog';

// T076 — las personas del comercio y lo que el Propietario hace con cada una (FR-008a, FR-011).
describe('MembersSection', () => {
  let commands: ReturnType<typeof fakeTeamCommands>;
  const dialog = { open: vi.fn() };
  const announcer = { announce: vi.fn(async () => undefined) };
  const owner = member('owner', 'Dueña', 'owner', { isOwner: true });

  beforeEach(() => {
    commands = fakeTeamCommands();
    dialog.open.mockReset();
    announcer.announce.mockClear();
    TestBed.configureTestingModule({
      imports: [MembersSection],
      providers: [
        { provide: TEAM_COMMANDS, useValue: commands },
        { provide: MatDialog, useValue: dialog },
        { provide: LiveAnnouncer, useValue: announcer },
      ],
    });
  });

  async function render(members: Membership[]) {
    const fixture = TestBed.createComponent(MembersSection);
    fixture.componentRef.setInput('tenantId', T1);
    fixture.componentRef.setInput('members', members);
    fixture.componentRef.setInput('roles', presetRolesOfT1({ catalog: 2 }));
    await settle();
    const root = fixture.nativeElement as HTMLElement;
    const row = (name: string) => {
      const group = root.querySelector<HTMLElement>(`[role="group"][aria-label="${name}"]`);
      if (!group) throw new Error(`No hay fila de ${name}`);
      const button = (text: string) => [...group.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
      return { group, button, select: group.querySelector('select') };
    };
    return { root, row };
  }

  it('primero el Propietario, después las activas y al final las de baja, con su rol y su estado', async () => {
    const { root, row } = await render([
      member('zoe', 'Zoe', 'catalog', { status: 'disabled' }),
      member('ana', 'Ana', 'catalog'),
      owner,
    ]);
    expect([...root.querySelectorAll('.name')].map((n) => n.textContent)).toEqual(['Dueña', 'Ana', 'Zoe']);
    expect(row('Dueña').group.textContent).toContain('Propietario · Activa');
    expect(row('Dueña').button('Dar de baja')).toBeUndefined();
    expect(row('Ana').group.textContent).toContain('Catálogo · Activa');
    expect(row('Zoe').group.textContent).toContain('De baja');
    expect(row('Zoe').button('Reactivar')).toBeDefined();
  });

  it('con solo el Propietario, invita a sumar al equipo', async () => {
    const { root } = await render([owner]);
    expect(root.textContent).toContain('Todavía no sumaste a nadie');
  });

  it('el rol de Propietario no se ofrece para asignar: solo se traspasa', async () => {
    const { row } = await render([owner, member('ana', 'Ana', 'catalog')]);
    expect([...(row('Ana').select?.options ?? [])].map((o) => o.textContent)).toEqual(['Catálogo']);
  });

  it('cambiar el rol lo asigna; si el servidor lo rechaza, el selector vuelve al vigente', async () => {
    const fixture = TestBed.createComponent(MembersSection);
    fixture.componentRef.setInput('tenantId', T1);
    fixture.componentRef.setInput('members', [owner, member('ana', 'Ana', 'catalog')]);
    fixture.componentRef.setInput('roles', [...presetRolesOfT1(), { ...presetRolesOfT1()[1]!, id: 'precios', name: 'Precios', preset: null }]);
    await settle();
    const select = (fixture.nativeElement as HTMLElement).querySelector('select');
    if (!select) throw new Error('No hay selector de rol');

    commands.assignRole.mockResolvedValue({ ok: false, code: 'permission-denied', message: '' });
    select.value = 'precios';
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(commands.assignRole).toHaveBeenCalledWith(T1, { uid: 'ana', roleId: 'precios' });
    expect(select.value).toBe('catalog');
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('No tenés permiso');

    commands.assignRole.mockResolvedValue({ ok: true, data: {} });
    select.value = 'precios';
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(announcer.announce).toHaveBeenCalledWith('Ana ahora tiene el rol Precios');
  });

  it('dar de baja pide confirmación y no toca nada si se cancela', async () => {
    const { row } = await render([owner, member('ana', 'Ana', 'catalog')]);
    dialog.open.mockReturnValue({ afterClosed: () => of(false) });
    row('Ana').button('Dar de baja')?.click();
    await settle();
    expect(dialog.open).toHaveBeenCalledWith(ConfirmDialog, expect.anything());
    expect(commands.setMembershipEnabled).not.toHaveBeenCalled();

    commands.setMembershipEnabled.mockResolvedValue({ ok: true, data: { status: 'disabled' } });
    dialog.open.mockReturnValue({ afterClosed: () => of(true) });
    row('Ana').button('Dar de baja')?.click();
    await settle();
    expect(commands.setMembershipEnabled).toHaveBeenCalledWith(T1, { uid: 'ana', enabled: false });
  });

  it('reactivar no pide confirmación', async () => {
    commands.setMembershipEnabled.mockResolvedValue({ ok: true, data: { status: 'active' } });
    const { row } = await render([owner, member('zoe', 'Zoe', 'catalog', { status: 'disabled' })]);
    row('Zoe').button('Reactivar')?.click();
    await settle();
    expect(commands.setMembershipEnabled).toHaveBeenCalledWith(T1, { uid: 'zoe', enabled: true });
  });

  it('traspasar la propiedad usa el rol que elige quien deja de ser Propietario', async () => {
    commands.transferOwnership.mockResolvedValue({ ok: true, data: { ownerUid: 'ana' } });
    dialog.open.mockReturnValue({ afterClosed: () => of('catalog') });
    const { row } = await render([owner, member('ana', 'Ana', 'catalog')]);
    row('Ana').button('Hacer Propietario')?.click();
    await settle();
    expect(dialog.open).toHaveBeenCalledWith(TransferOwnershipDialog, { data: expect.objectContaining({ name: 'Ana' }) });
    expect(commands.transferOwnership).toHaveBeenCalledWith(T1, { toUid: 'ana', newRoleIdForCurrentOwner: 'catalog' });
  });
});

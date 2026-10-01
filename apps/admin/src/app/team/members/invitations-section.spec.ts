import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Clipboard } from '@angular/cdk/clipboard';
import { TestBed } from '@angular/core/testing';
import type { Invitation } from '@ecommerce/domain';
import { TEAM_COMMANDS } from '../../core/client';
import { fakeTeamCommands, invitation, presetRolesOfT1, T1 } from '../../../testing/fakes';
import { settle } from '../../../testing/settle';
import { InvitationsSection } from './invitations-section';

// T076 — invitar sin tope y seguir las pendientes (FR-006, FR-007).
describe('InvitationsSection', () => {
  let commands: ReturnType<typeof fakeTeamCommands>;
  const clipboard = { copy: vi.fn(() => true) };
  const announcer = { announce: vi.fn(async () => undefined) };

  beforeEach(() => {
    commands = fakeTeamCommands();
    clipboard.copy.mockClear();
    announcer.announce.mockClear();
    TestBed.configureTestingModule({
      imports: [InvitationsSection],
      providers: [
        { provide: TEAM_COMMANDS, useValue: commands },
        { provide: Clipboard, useValue: clipboard },
        { provide: LiveAnnouncer, useValue: announcer },
      ],
    });
  });

  async function render(invitations: Invitation[] = []) {
    const fixture = TestBed.createComponent(InvitationsSection);
    fixture.componentRef.setInput('tenantId', T1);
    fixture.componentRef.setInput('invitations', invitations);
    fixture.componentRef.setInput('roles', presetRolesOfT1());
    await settle();
    const root = fixture.nativeElement as HTMLElement;
    const email = root.querySelector<HTMLInputElement>('input[type="email"]');
    const invite = async (address: string) => {
      if (!email) throw new Error('No hay campo de correo');
      email.value = address;
      email.dispatchEvent(new Event('input'));
      root.querySelector('form')?.dispatchEvent(new Event('submit'));
      await settle();
    };
    const button = (scope: ParentNode, text: string) => [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
    return { root, email, invite, button };
  }

  it('invita con el rol de Catálogo por omisión y muestra el enlace para compartir', async () => {
    commands.inviteCollaborator.mockResolvedValue({ ok: true, data: { invitationId: 'i9', token: 't1/i9' } });
    const { root, email, invite, button } = await render();
    expect([...root.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Catálogo']);

    await invite(' nueva@t1.test ');
    expect(commands.inviteCollaborator).toHaveBeenCalledWith(T1, { email: 'nueva@t1.test', roleId: 'catalog' });
    const link = root.querySelector<HTMLInputElement>('input[aria-label="Enlace de la invitación"]');
    expect(link?.value).toBe(`${location.origin}/invitation/t1/i9`);
    expect(email?.value).toBe('');

    const shown = root.querySelector('.link');
    if (!shown) throw new Error('No se muestra el enlace');
    button(shown, 'Copiar enlace')?.click();
    expect(clipboard.copy).toHaveBeenCalledWith(`${location.origin}/invitation/t1/i9`);
    expect(announcer.announce).toHaveBeenCalledWith('Enlace copiado');
  });

  it('un correo mal escrito no se envía', async () => {
    const { root, invite } = await render();
    await invite('no-es-correo');
    expect(commands.inviteCollaborator).not.toHaveBeenCalled();
    expect(root.textContent).toContain('Ese correo no parece válido');
  });

  it('a quien ya es parte del equipo no se lo invita, y se explica', async () => {
    commands.inviteCollaborator.mockResolvedValue({ ok: false, code: 'invalid-argument', message: '' });
    const { root, invite } = await render();
    await invite('ana@t1.test');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('ana@t1.test ya es parte del equipo');
  });

  it('lista las pendientes con su rol y su vencimiento, y las vencidas como tales', async () => {
    const { root } = await render([
      invitation('i1', 'vieja@t1.test', { expiresAt: new Date('2020-01-01T00:00:00Z') }),
      invitation('i2', 'beto@t1.test', { expiresAt: new Date('2099-01-15T12:00:00Z') }),
    ]);
    const rows = [...root.querySelectorAll('li')].map((li) => li.textContent?.replace(/\s+/g, ' ').trim());
    expect(rows[0]).toContain('beto@t1.test');
    expect(rows[0]).toMatch(/Catálogo · Vence el 15 ene 2099/);
    expect(rows[1]).toContain('vieja@t1.test');
    expect(rows[1]).toContain('Vencida');
  });

  it('sin pendientes, lo dice', async () => {
    const { root } = await render([]);
    expect(root.textContent).toContain('No hay invitaciones pendientes.');
  });

  it('revocar y copiar el enlace de una pendiente', async () => {
    commands.revokeInvitation.mockResolvedValue({ ok: true, data: {} });
    const { root, button } = await render([invitation('i2', 'beto@t1.test')]);
    const row = root.querySelector('[role="group"][aria-label="beto@t1.test"]');
    if (!row) throw new Error('No está la invitación');
    button(row, 'Copiar enlace')?.click();
    expect(clipboard.copy).toHaveBeenCalledWith(`${location.origin}/invitation/t1/i2`);
    button(row, 'Revocar')?.click();
    await settle();
    expect(commands.revokeInvitation).toHaveBeenCalledWith(T1, { invitationId: 'i2' });
    expect(announcer.announce).toHaveBeenCalledWith('Invitación de beto@t1.test revocada');
  });
});

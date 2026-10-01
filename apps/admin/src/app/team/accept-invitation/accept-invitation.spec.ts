import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { SignOut } from '../../auth/sign-out';
import { SESSION, TEAM_COMMANDS } from '../../core/client';
import { FakeSession, fakeTeamCommands, OWNER, T1 } from '../../../testing/fakes';
import { settle } from '../../../testing/settle';
import { AcceptInvitation } from './accept-invitation';

// T080: el enlace de invitación. No da acceso hasta aceptar (FR-007); suma una membresía (FR-005).
describe('AcceptInvitation', () => {
  let commands: ReturnType<typeof fakeTeamCommands>;
  const signOut = { run: vi.fn(async () => undefined) };

  beforeEach(() => {
    commands = fakeTeamCommands();
    const session = new FakeSession();
    session.user = { ...OWNER, email: 'nueva@t1.test' };
    signOut.run.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'invitation/:tenantId/:invitationId', component: AcceptInvitation }, { path: '**', children: [] }], withComponentInputBinding()),
        { provide: SESSION, useValue: session },
        { provide: TEAM_COMMANDS, useValue: commands },
        { provide: SignOut, useValue: signOut },
      ],
    });
  });

  async function open() {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/invitation/t1/i1');
    await settle();
    const root = harness.routeNativeElement as HTMLElement;
    const button = (name: string) => [...root.querySelectorAll<HTMLElement>('button, a')].find((b) => b.textContent?.trim() === name);
    return { root, button };
  }

  it('dice con qué cuenta se va a sumar y, al aceptar, entra al comercio', async () => {
    commands.acceptInvitation.mockResolvedValue({ ok: true, data: { tenantId: T1, roleId: 'catalog' } });
    const { root, button } = await open();
    expect(root.textContent).toContain('nueva@t1.test');

    button('Aceptar invitación')?.click();
    await settle();
    expect(commands.acceptInvitation).toHaveBeenCalledWith('t1/i1');
    expect(TestBed.inject(Router).url).toBe('/t/t1');
  });

  it.each([
    ['expired', 'La invitación venció'],
    ['revoked', 'La invitación fue cancelada'],
    ['accepted', 'Esta invitación ya se usó'],
  ])('una invitación %s lo explica y no entra', async (reason, message) => {
    commands.acceptInvitation.mockResolvedValue({ ok: false, code: 'invalid-argument', message: '', details: { reason } });
    const { root, button } = await open();
    button('Aceptar invitación')?.click();
    await settle();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(TestBed.inject(Router).url).toBe('/invitation/t1/i1');
  });

  it('con otra cuenta, ofrece cerrar sesión para entrar con la invitada', async () => {
    commands.acceptInvitation.mockResolvedValue({ ok: false, code: 'invalid-argument', message: '', details: { reason: 'email-mismatch' } });
    const { root, button } = await open();
    button('Aceptar invitación')?.click();
    await settle();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Esta invitación es para otro correo');
    button('Cerrar sesión')?.click();
    expect(signOut.run).toHaveBeenCalled();
  });

  it('si ya es miembro, ofrece entrar', async () => {
    commands.acceptInvitation.mockResolvedValue({ ok: false, code: 'invalid-argument', message: '', details: { reason: 'already-member' } });
    const { button } = await open();
    button('Aceptar invitación')?.click();
    await settle();
    expect(button('Entrar al comercio')?.getAttribute('href')).toBe('/t/t1');
  });
});

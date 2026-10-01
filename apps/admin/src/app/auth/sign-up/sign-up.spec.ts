import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { SESSION } from '../../core/client';
import { FakeSession } from '../../../testing/fakes';
import { settle } from '../../../testing/settle';
import { SignUp } from './sign-up';

describe('SignUp', () => {
  let session: FakeSession;

  beforeEach(() => {
    session = new FakeSession();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'signup', component: SignUp }, { path: '**', children: [] }], withComponentInputBinding()),
        { provide: SESSION, useValue: session },
      ],
    });
  });

  async function open(url = '/signup?returnUrl=%2Finvitation%2Ft1%2Fi1') {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    const root = harness.routeNativeElement as HTMLElement;
    const fill = async (label: string, value: string) => {
      const field = [...root.querySelectorAll('mat-form-field')].find((f) => f.querySelector('mat-label')?.textContent?.trim() === label);
      const input = field?.querySelector('input');
      if (!input) throw new Error(`No hay campo ${label}`);
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle();
    };
    const submit = async () => {
      root.querySelector('form')?.dispatchEvent(new Event('submit'));
      await settle();
    };
    return { root, fill, submit };
  }

  it('crea la cuenta con su nombre y vuelve al enlace de la invitación', async () => {
    const { fill, submit } = await open();
    await fill('Tu nombre', ' Nueva ');
    await fill('Correo', 'nueva@t1.test');
    await fill('Contraseña', 'secreta1');
    await submit();
    expect(session.signUps).toEqual([{ email: 'nueva@t1.test', password: 'secreta1', displayName: 'Nueva' }]);
    expect(TestBed.inject(Router).url).toBe('/invitation/t1/i1');
  });

  it('no envía sin nombre ni con una contraseña corta', async () => {
    const { root, fill, submit } = await open();
    await fill('Correo', 'nueva@t1.test');
    await fill('Contraseña', '123');
    await submit();
    expect(session.signUps).toEqual([]);
    expect(root.textContent).toContain('Escribí tu nombre');
    expect(root.textContent).toContain('Usá al menos 6 caracteres');
  });

  it('si el correo ya tiene cuenta, invita a iniciar sesión conservando adónde volver', async () => {
    session.nextSignUp = { ok: false, reason: 'email-in-use' };
    const { root, fill, submit } = await open();
    await fill('Tu nombre', 'Nueva');
    await fill('Correo', 'nueva@t1.test');
    await fill('Contraseña', 'secreta1');
    await submit();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Ya hay una cuenta con ese correo');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/login?returnUrl=%2Finvitation%2Ft1%2Fi1');
  });
});

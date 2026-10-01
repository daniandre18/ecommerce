import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SESSION } from '../../core/client';
import { FakeSession } from '../../../testing/fakes';
import { settle } from '../../../testing/settle';
import { Login, safeReturnUrl } from './login';

@Component({ template: '' })
class Blank {}

describe('Login', () => {
  let session: FakeSession;

  beforeEach(() => {
    session = new FakeSession();
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([{ path: '**', component: Blank }]), { provide: SESSION, useValue: session }],
    });
  });

  async function render(returnUrl?: string) {
    const fixture = TestBed.createComponent(Login);
    if (returnUrl) fixture.componentRef.setInput('returnUrl', returnUrl);
    await settle();
    const root = fixture.nativeElement as HTMLElement;
    const type = async (label: string, value: string) => {
      const input = root.querySelector<HTMLInputElement>(`input[autocomplete="${label}"]`);
      if (!input) throw new Error(`No hay campo ${label}`);
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle();
    };
    const submit = async () => {
      root.querySelector('form')?.dispatchEvent(new Event('submit'));
      await settle();
    };
    return { root, type, submit };
  }

  it('pide correo y contraseña antes de enviar nada', async () => {
    const { root, submit } = await render();
    await submit();
    expect(session.signIns).toEqual([]);
    expect(root.textContent).toContain('Ingresá tu correo');
    expect(root.textContent).toContain('Ingresá tu contraseña');
  });

  it('con credenciales inválidas avisa sin decir cuál de las dos falló', async () => {
    session.nextSignIn = { ok: false, reason: 'invalid-credentials' };
    const { root, type, submit } = await render();
    await type('username', 'owner@t1.test');
    await type('current-password', 'otra');
    await submit();

    expect(session.signIns).toEqual([{ email: 'owner@t1.test', password: 'otra' }]);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('El correo o la contraseña no son correctos');
  });

  it('al entrar, vuelve a la página que se había pedido', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    const { type, submit } = await render('/t/t1/catalog');
    await type('username', 'owner@t1.test');
    await type('current-password', 'test-1234');
    await submit();
    expect(navigate).toHaveBeenCalledWith('/t/t1/catalog');
  });

  describe('a dónde vuelve', () => {
    it.each(['/t/t1/catalog', '/'])('a una ruta del panel: %s', (url) => {
      expect(safeReturnUrl(url)).toBe(url);
    });

    // Un enlace armado por otro no puede sacar a la persona del panel después de entrar.
    it.each(['https://otro.sitio', '//otro.sitio', '/\\otro.sitio', 'javascript:alert(1)', undefined])('nunca afuera: %s', (url) => {
      expect(safeReturnUrl(url)).toBe('/');
    });
  });
});

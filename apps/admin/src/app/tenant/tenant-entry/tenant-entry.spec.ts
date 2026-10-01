import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SignOut } from '../../auth/sign-out';
import { settle } from '../../../testing/settle';
import { TenantEntry } from './tenant-entry';

describe('TenantEntry', () => {
  const signOut = { run: vi.fn(async () => undefined) };

  beforeEach(() => {
    signOut.run.mockClear();
    TestBed.configureTestingModule({
      imports: [TenantEntry],
      providers: [provideRouter([]), { provide: SignOut, useValue: signOut }],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(TenantEntry);
    await settle();
    const root = fixture.nativeElement as HTMLElement;
    const enter = async (code: string) => {
      const input = root.querySelector<HTMLInputElement>('input');
      if (!input) throw new Error('No hay campo de código');
      input.value = code;
      input.dispatchEvent(new Event('input'));
      root.querySelector('form')?.dispatchEvent(new Event('submit'));
      await settle();
    };
    return { root, enter };
  }

  it('abre el catálogo del comercio indicado', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const { enter } = await render();
    await enter(' t1 ');
    expect(navigate).toHaveBeenCalledWith(['/t', 't1', 'catalog']);
  });

  // El código forma una ruta: una barra la cambiaría por otra.
  it('rechaza un código que no es un único segmento', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    const { root, enter } = await render();
    await enter('t1/members');
    expect(navigate).not.toHaveBeenCalled();
    expect(root.textContent).toContain('Ese código no es válido');
  });

  it('permite cerrar la sesión', async () => {
    const { root } = await render();
    [...root.querySelectorAll('button')].find((b) => b.textContent?.includes('Cerrar sesión'))?.click();
    expect(signOut.run).toHaveBeenCalled();
  });
});

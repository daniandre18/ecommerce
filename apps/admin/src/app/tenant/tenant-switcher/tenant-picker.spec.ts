import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SignOut } from '../../auth/sign-out';
import { SESSION, TENANT_DIRECTORY } from '../../core/client';
import { access, FakeSession, FakeTenantDirectory, OWNER } from '../../../testing/fakes';
import { settle } from '../../../testing/settle';
import { TenantPicker } from './tenant-picker';

// T075 — después de entrar, la cuenta va a su comercio; con varios, elige (FR-005).
describe('TenantPicker', () => {
  let directory: FakeTenantDirectory;
  const signOut = { run: vi.fn(async () => undefined) };

  beforeEach(() => {
    directory = new FakeTenantDirectory();
    const session = new FakeSession();
    session.user = OWNER;
    signOut.run.mockClear();
    TestBed.configureTestingModule({
      imports: [TenantPicker],
      providers: [
        provideRouter([]),
        { provide: SESSION, useValue: session },
        { provide: TENANT_DIRECTORY, useValue: directory },
        { provide: SignOut, useValue: signOut },
      ],
    });
  });

  async function render() {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(TenantPicker);
    await settle();
    return { root: fixture.nativeElement as HTMLElement, navigate };
  }

  it('escucha los comercios de la cuenta con sesión, y muestra un esqueleto mientras llegan', async () => {
    const { root } = await render();
    expect(directory.open.params).toBe(OWNER.uid);
    expect(root.querySelector('ui-skeleton')).not.toBeNull();
  });

  it('con un solo comercio entra directo a su catálogo, sin dejar el selector en el historial', async () => {
    const { navigate } = await render();
    directory.open.emit([access('t1', 'Comercio Uno', true)]);
    await settle();
    expect(navigate).toHaveBeenCalledWith(['/t', 't1', 'catalog'], { replaceUrl: true });
  });

  it('con varios, los ofrece por nombre y dice en cuál es Propietaria', async () => {
    const { root, navigate } = await render();
    directory.open.emit([access('t2', 'Comercio Dos', true), access('t1', 'Comercio Uno')]);
    await settle();
    expect(navigate).not.toHaveBeenCalled();
    const links = [...root.querySelectorAll('a')];
    expect(links.map((a) => [a.querySelector('.name')?.textContent?.trim(), a.getAttribute('href')])).toEqual([
      ['Comercio Dos', '/t/t2/catalog'],
      ['Comercio Uno', '/t/t1/catalog'],
    ]);
    expect(links[0]?.textContent).toContain('Propietario');
    expect(links[1]?.textContent).toContain('Colaboración');
  });

  it('sin comercios activos lo dice, y permite cerrar la sesión', async () => {
    const { root } = await render();
    directory.open.emit([]);
    await settle();
    expect(root.querySelector('ui-empty-state')?.textContent).toContain('Tu cuenta no tiene comercios activos');
    [...root.querySelectorAll('button')].find((b) => b.textContent?.includes('Cerrar sesión'))?.click();
    expect(signOut.run).toHaveBeenCalled();
  });

  it('si falla, lo dice y el reintento vuelve a pedir', async () => {
    const { root } = await render();
    directory.open.fail(new Error('sin red'));
    await settle();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('No pudimos cargar tus comercios');
    root.querySelector<HTMLButtonElement>('[role="alert"] button')?.click();
    await settle();
    expect(directory.subscriptions).toHaveLength(2);
  });
});

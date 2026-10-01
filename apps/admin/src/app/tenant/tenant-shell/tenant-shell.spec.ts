import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { SignOut } from '../../auth/sign-out';
import { CATALOG_QUERIES, SESSION, TENANT_DIRECTORY } from '../../core/client';
import { access, FakeCatalogQueries, FakeSession, FakeTenantDirectory, OWNER, tenant } from '../../../testing/fakes';
import { settle } from '../../../testing/settle';
import { TenantShell } from './tenant-shell';

@Component({ template: '<p>contenido del comercio</p>' })
class Child {}

describe('TenantShell', () => {
  let queries: FakeCatalogQueries;
  let directory: FakeTenantDirectory;
  const signOut = { run: vi.fn(async () => undefined) };

  beforeEach(() => {
    queries = new FakeCatalogQueries();
    directory = new FakeTenantDirectory();
    const session = new FakeSession();
    session.user = OWNER;
    signOut.run.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 't/:tenantId', component: TenantShell, children: [{ path: '', component: Child }] }], withComponentInputBinding()),
        { provide: CATALOG_QUERIES, useValue: queries },
        { provide: SignOut, useValue: signOut },
        { provide: SESSION, useValue: session },
        { provide: TENANT_DIRECTORY, useValue: directory },
      ],
    });
  });

  async function open(url = '/t/t1') {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }

  it('muestra el nombre del comercio de la ruta y su contenido', async () => {
    const root = await open();
    expect(queries.tenants.map((s) => s.params)).toEqual(['t1']);
    queries.tenants[0]?.emit(tenant({ name: 'Comercio Uno' }));
    await settle();
    expect(root.querySelector('header')?.textContent).toContain('Comercio Uno');
    expect(root.textContent).toContain('contenido del comercio');
  });

  it('el contenido no espera al nombre: cada vista muestra su propio esqueleto', async () => {
    const root = await open();
    expect(root.textContent).toContain('contenido del comercio');
  });

  // Sin membresía, Firestore niega la lectura exista o no el comercio: el mensaje no los distingue.
  it('sin acceso, lo dice sin revelar si el comercio existe, y permite reintentar', async () => {
    const root = await open();
    queries.tenants[0]?.fail(Object.assign(new Error('denegado'), { code: 'permission-denied' }));
    await settle();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Puede que no exista o que no tengas acceso');
    expect(root.textContent).not.toContain('contenido del comercio');

    root.querySelector<HTMLButtonElement>('[role="alert"] button')?.click();
    await settle();
    expect(queries.tenants.filter((s) => !s.closed)).toHaveLength(1);
    expect(queries.tenants).toHaveLength(2);
  });

  // T075: cambiar de comercio es navegar; con uno solo, no se ofrece.
  it('ofrece cambiar de comercio solo si la cuenta tiene más de uno', async () => {
    const root = await open();
    const link = () => [...root.querySelectorAll('a')].find((a) => a.textContent?.includes('Cambiar de comercio'));
    directory.open.emit([access('t1', 'Comercio Uno', true)]);
    await settle();
    expect(link()).toBeUndefined();
    directory.open.emit([access('t1', 'Comercio Uno', true), access('t2', 'Comercio Dos')]);
    await settle();
    expect(link()?.getAttribute('href')).toBe('/');
  });

  it('permite cerrar la sesión', async () => {
    const root = await open();
    [...root.querySelectorAll('button')].find((b) => b.textContent?.includes('Cerrar sesión'))?.click();
    expect(signOut.run).toHaveBeenCalled();
  });
});

import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, type ActivatedRouteSnapshot, type RouterStateSnapshot, type UrlTree } from '@angular/router';
import { SESSION, TENANT_DIRECTORY } from '../core/client';
import { FakeSession, FakeTenantDirectory, OWNER } from '../../testing/fakes';
import { settle } from '../../testing/settle';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  let session: FakeSession;
  let directory: FakeTenantDirectory;

  beforeEach(() => {
    session = new FakeSession();
    directory = new FakeTenantDirectory();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SESSION, useValue: session }, { provide: TENANT_DIRECTORY, useValue: directory }],
    });
  });

  const run = (url: string) =>
    TestBed.runInInjectionContext(() => authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot)) as Promise<boolean | UrlTree>;

  it('sin sesión manda al inicio de sesión, recordando adónde se quería ir', async () => {
    const result = await run('/t/t1/catalog');
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login?returnUrl=%2Ft%2Ft1%2Fcatalog');
  });

  it('con sesión deja pasar', async () => {
    session.user = OWNER;
    await expect(run('/t/t1/catalog')).resolves.toBe(true);
  });

  // SC-009: así el canal de Firestore se abre mientras se descarga la vista, y no después.
  it('con sesión, ya empieza a escuchar los comercios de la cuenta', async () => {
    session.user = OWNER;
    await run('/t/t1/catalog');
    await settle();
    expect(directory.open.params).toBe(OWNER.uid);
  });
});

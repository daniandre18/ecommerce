import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, type ActivatedRouteSnapshot, type RouterStateSnapshot, type UrlTree } from '@angular/router';
import { SESSION } from '../core/client';
import { FakeSession, OWNER } from '../../testing/fakes';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  let session: FakeSession;

  beforeEach(() => {
    session = new FakeSession();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: SESSION, useValue: session }] });
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
});

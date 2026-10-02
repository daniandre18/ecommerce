import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withNavigationErrorHandler } from '@angular/router';
import { settle } from '../testing/settle';
import { NavigationFailure, rememberNavigationFailure } from './shared/navigation-failure';
import { App } from './app';

describe('App', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] });
  });

  it('ofrece un enlace para saltar al contenido principal (WCAG 2.4.1)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    const skipLink = root.querySelector<HTMLAnchorElement>('a.skip-link');
    expect(skipLink?.getAttribute('href')).toBe('#contenido');
    expect(root.querySelector('main#contenido')).not.toBeNull();
  });

  it('el contenido principal puede recibir el foco que le envía el enlace', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const main = (fixture.nativeElement as HTMLElement).querySelector('main');
    expect(main?.getAttribute('tabindex')).toBe('-1');
  });

  // SC-009: Angular reemplaza la estructura estática de index.html; hasta la primera vista, dibuja la misma.
  it('mantiene la estructura de carga hasta que termina la primera navegación, aunque redirija', async () => {
    @Component({ template: '<p>vista abierta</p>' })
    class View {}
    let release: () => void = () => undefined;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: '', pathMatch: 'full', redirectTo: 'vista' },
          { path: 'vista', loadComponent: () => new Promise<typeof View>((resolve) => (release = () => resolve(View))) },
        ]),
      ],
    });
    const fixture = TestBed.createComponent(App);
    const root = fixture.nativeElement as HTMLElement;
    const navigation = TestBed.inject(Router).navigateByUrl('/');
    await settle();
    fixture.detectChanges();
    expect(root.querySelector('.boot')?.textContent).toContain('Cargando el panel');

    release();
    await navigation;
    await settle();
    fixture.detectChanges();
    expect(root.querySelector('.boot')).toBeNull();
    expect(root.textContent).toContain('vista abierta');
  });

  // T098 (FR-037): sin red, el código de una vista no se descarga; eso no puede quedar en silencio.
  it('si una vista no se puede abrir, lo avisa, el reintento recarga esa dirección y el aviso se va al abrir otra', async () => {
    @Component({ template: '<p>vista abierta</p>' })
    class View {}
    let online = false;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(
          [{ path: 'vista', loadComponent: () => (online ? Promise.resolve(View) : Promise.reject(new Error('Failed to fetch dynamically imported module'))) }],
          withNavigationErrorHandler(rememberNavigationFailure),
        ),
      ],
    });
    const fixture = TestBed.createComponent(App);
    const root = fixture.nativeElement as HTMLElement;
    await TestBed.inject(Router).navigateByUrl('/vista').catch(() => undefined);
    await settle();
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('No pudimos abrir esa vista');

    const retry = vi.spyOn(TestBed.inject(NavigationFailure), 'retry').mockImplementation(() => undefined);
    root.querySelector<HTMLButtonElement>('[role="alert"] button')?.click();
    expect(retry).toHaveBeenCalledWith('/vista');

    online = true;
    await TestBed.inject(Router).navigateByUrl('/vista');
    await settle();
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.textContent).toContain('vista abierta');
  });
});

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
});

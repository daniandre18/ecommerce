import { TestBed } from '@angular/core/testing';
import { ErrorState } from './error-state';

// T030 — FR-037: toda vista tiene un estado de error comprensible con acción de reintento.
describe('ErrorState', () => {
  const render = async (inputs: Record<string, unknown> = {}) => {
    const fixture = TestBed.createComponent(ErrorState);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  };

  it('se anuncia al aparecer, sin robar el foco (WCAG 4.1.3)', async () => {
    const { host } = await render();
    expect(host.getAttribute('role')).toBe('alert');
  });

  it('explica qué pasó con un texto por defecto comprensible', async () => {
    const { host } = await render();
    expect(host.textContent).toContain('No pudimos cargar esta información');
  });

  it('acepta un encabezado y un detalle propios de la vista', async () => {
    const { host } = await render({ heading: 'No pudimos cargar el catálogo', message: 'Revisá tu conexión.' });
    expect(host.textContent).toContain('No pudimos cargar el catálogo');
    expect(host.textContent).toContain('Revisá tu conexión.');
  });

  it('sin detalle, no deja un párrafo vacío', async () => {
    const { host } = await render();
    expect(host.querySelector('.message')).toBeNull();
  });

  it('ofrece reintentar con un botón real, operable por teclado', async () => {
    const { fixture, host } = await render();
    let retries = 0;
    fixture.componentInstance.retry.subscribe(() => retries++);

    const button = host.querySelector('button');
    expect(button?.getAttribute('type')).toBe('button');
    expect(button?.textContent?.trim()).toBe('Reintentar');

    button?.click();
    await fixture.whenStable();
    expect(retries).toBe(1);
  });

  // Hallazgo de T001 de la 003: al recargar, `resource` conserva el error anterior hasta que llega el
  // nuevo resultado. Sin red, eso son 10 s en los que la vista no cambia: el clic no daba ninguna señal.
  it('mientras reintenta, lo dice y no acepta otro clic, sin perder el foco', async () => {
    const { fixture, host } = await render({ retrying: true });
    let retries = 0;
    fixture.componentInstance.retry.subscribe(() => retries++);

    const button = host.querySelector('button');
    expect(button?.textContent?.trim()).toBe('Reintentando…');
    expect(button?.getAttribute('aria-disabled')).toBe('true');
    // Sin el atributo `disabled`: el botón conserva el foco de quien lo acaba de activar.
    expect(button?.hasAttribute('disabled')).toBe(false);

    button?.click();
    await fixture.whenStable();
    expect(retries).toBe(0);
  });

  it('cuando el reintento termina, vuelve a ofrecerlo', async () => {
    const { fixture, host } = await render({ retrying: true });
    fixture.componentRef.setInput('retrying', false);
    await fixture.whenStable();
    const button = host.querySelector('button');
    expect(button?.textContent?.trim()).toBe('Reintentar');
    expect(button?.getAttribute('aria-disabled')).toBeNull();
  });
});

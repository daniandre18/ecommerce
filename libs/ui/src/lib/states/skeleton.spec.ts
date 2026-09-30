import { TestBed } from '@angular/core/testing';
import { Skeleton } from './skeleton';

// T030 — FR-036: el esqueleto reserva el espacio del contenido final mientras los datos llegan.
describe('Skeleton', () => {
  const render = async (inputs: Record<string, unknown> = {}) => {
    const fixture = TestBed.createComponent(Skeleton);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('anuncia la carga a los lectores de pantalla una sola vez, no fila por fila', async () => {
    const host = await render({ label: 'Cargando productos' });
    expect(host.getAttribute('role')).toBe('status');
    expect(host.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('.cdk-visually-hidden')?.textContent?.trim()).toBe('Cargando productos');
  });

  it('las filas son decorativas: se ocultan a la tecnología asistiva', async () => {
    const rows = (await render({ rows: 2 })).querySelectorAll('.skeleton-row');
    expect(rows).toHaveLength(2);
    rows.forEach((row) => expect(row.getAttribute('aria-hidden')).toBe('true'));
  });

  it('cada fila ocupa la altura de la fila real, para que el contenido no salte al llegar', async () => {
    const rows = (await render({ rows: 3, rowHeight: '72px' })).querySelectorAll<HTMLElement>('.skeleton-row');
    expect(rows).toHaveLength(3); // sin esto, cero filas pasaría la prueba en vacío
    rows.forEach((row) => expect(row.style.height).toBe('72px'));
  });

  it('por defecto muestra tres filas y un texto genérico', async () => {
    const host = await render();
    expect(host.querySelectorAll('.skeleton-row')).toHaveLength(3);
    expect(host.querySelector('.cdk-visually-hidden')?.textContent?.trim()).toBe('Cargando…');
  });
});

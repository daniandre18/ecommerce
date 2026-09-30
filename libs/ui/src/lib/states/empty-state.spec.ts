import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EmptyState } from './empty-state';

@Component({
  imports: [EmptyState],
  template: `
    <ui-empty-state heading="Todavía no hay productos" message="Creá el primero para empezar a vender.">
      <a href="/productos/nuevo">Crear producto</a>
    </ui-empty-state>
  `,
})
class WithAction {}

@Component({
  imports: [EmptyState],
  template: `<ui-empty-state heading="Sin resultados para esta búsqueda" />`,
})
class WithoutAction {}

// T030 — FR-037: estado de vacío que explica la situación y ofrece la acción de creación
// "cuando corresponda": la acción la aporta la vista, porque puede ser un botón o un enlace.
describe('EmptyState', () => {
  const render = async <T>(host: new () => T) => {
    const fixture = TestBed.createComponent(host);
    await fixture.whenStable();
    return fixture.nativeElement.querySelector('ui-empty-state') as HTMLElement;
  };

  it('explica la situación', async () => {
    const state = await render(WithAction);
    expect(state.textContent).toContain('Todavía no hay productos');
    expect(state.textContent).toContain('Creá el primero para empezar a vender.');
  });

  it('se anuncia con cortesía: un vacío no es un error (FR-037)', async () => {
    const state = await render(WithAction);
    expect(state.getAttribute('role')).toBe('status');
  });

  it('muestra la acción que aporta la vista', async () => {
    const link = (await render(WithAction)).querySelector('a');
    expect(link?.textContent).toBe('Crear producto');
    expect(link?.getAttribute('href')).toBe('/productos/nuevo');
  });

  it('funciona sin acción y sin detalle', async () => {
    const state = await render(WithoutAction);
    expect(state.textContent).toContain('Sin resultados para esta búsqueda');
    expect(state.querySelector('.message')).toBeNull();
  });
});

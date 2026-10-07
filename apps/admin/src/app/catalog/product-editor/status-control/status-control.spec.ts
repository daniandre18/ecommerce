import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import { createIncompleteVariant, optionId, productId, valueId, variantId, type Variant, type VariationOption } from '@ecommerce/domain';
import { of } from 'rxjs';
import { CATALOG_COMMANDS } from '../../../core/client';
import { fakeCatalogCommands, product, T1 } from '../../../../testing/fakes';
import { settle } from '../../../../testing/settle';
import { StatusControl } from './status-control';

const color: VariationOption = {
  id: optionId('color'),
  name: 'Color',
  position: 0,
  values: [
    { id: valueId('rojo'), label: 'Rojo', position: 0 },
    { id: valueId('azul'), label: 'Azul', position: 1 },
  ],
};

const variantOf = (id: string, value: string, sku: string | null): Variant => ({
  ...createIncompleteVariant({ id: variantId(id), tenantId: T1, productId: productId('p1'), optionValues: { [color.id]: valueId(value) } }),
  sku: sku ? { raw: sku, normalized: sku } : null,
  version: 1,
});

// T059 — FR-023a: activar o dejar no listado exige variantes completas, y se dice cuáles faltan.
describe('StatusControl', () => {
  let commands: ReturnType<typeof fakeCatalogCommands>;
  let dialog: { open: ReturnType<typeof vi.fn> };
  let fixtureRef: ReturnType<typeof TestBed.createComponent<StatusControl>>;

  beforeEach(() => {
    commands = fakeCatalogCommands();
    commands.setProductStatus.mockResolvedValue({ ok: true, data: { version: 3 } });
    commands.archiveProduct.mockResolvedValue({ ok: true, data: { version: 3 } });
    dialog = { open: vi.fn() };
    TestBed.configureTestingModule({
      imports: [StatusControl],
      providers: [provideRouter([]), { provide: CATALOG_COMMANDS, useValue: commands }, { provide: MatDialog, useValue: dialog }],
    });
  });

  async function render(variants: Variant[]) {
    const fixture = TestBed.createComponent(StatusControl);
    fixtureRef = fixture;
    fixture.componentRef.setInput('tenantId', T1);
    fixture.componentRef.setInput('product', product('p1', 'Camiseta', { options: [color], version: 2 }));
    fixture.componentRef.setInput('variants', variants);
    await settle();
    const root = fixture.nativeElement as HTMLElement;
    const choose = async (label: string) => {
      const radio = [...root.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((input) =>
        root.querySelector(`label[for="${input.id}"]`)?.textContent?.trim().startsWith(label),
      );
      if (!radio) throw new Error(`No hay opción «${label}»`);
      radio.click();
      await settle();
    };
    const button = (name: string) => [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);
    return { root, choose, button };
  }

  it('marca el estado actual', async () => {
    const { root } = await render([variantOf('v1', 'rojo', 'R')]);
    expect(root.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.value).toBe('draft');
  });

  it('con variantes sin SKU, dice cuáles impiden activarlo y no envía nada', async () => {
    const { root, choose, button } = await render([variantOf('v1', 'rojo', 'R'), variantOf('v2', 'azul', null)]);
    await choose('Activo');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Azul');
    expect(root.querySelector('[role="alert"]')?.textContent).not.toContain('Rojo');
    expect(button('Cambiar estado')?.disabled).toBe(true);
  });

  it.each([
    ['Activo', 'active'],
    ['No listado', 'unlisted'],
  ])('con todas completas pasa a %s, con la versión del producto', async (label, status) => {
    const { choose, button } = await render([variantOf('v1', 'rojo', 'R'), variantOf('v2', 'azul', 'A')]);
    await choose(label);
    button('Cambiar estado')?.click();
    await settle();
    expect(commands.setProductStatus).toHaveBeenCalledWith(T1, { productId: 'p1', version: 2, status });
  });

  // Completar un SKU cambia el producto (su resumen de variantes), pero no su estado: la elección sigue.
  it('un cambio del producto que no toca el estado no pierde lo elegido', async () => {
    const { choose, button } = await render([variantOf('v1', 'rojo', 'R'), variantOf('v2', 'azul', null)]);
    await choose('Activo');
    fixtureRef.componentRef.setInput('product', product('p1', 'Camiseta', { options: [color], version: 2, hasIncompleteVariants: false }));
    fixtureRef.componentRef.setInput('variants', [variantOf('v1', 'rojo', 'R'), variantOf('v2', 'azul', 'A')]);
    await settle();
    expect(button('Cambiar estado')?.disabled).toBe(false);
  });

  it('si el servidor lo rechaza porque algo cambió en el medio, nombra las variantes que lo impiden', async () => {
    commands.setProductStatus.mockResolvedValue({
      ok: false,
      code: 'incomplete-variants',
      message: 'faltan',
      details: { kind: 'incomplete-variants', variantIds: ['v2'] },
    });
    const { root, choose, button } = await render([variantOf('v1', 'rojo', 'R'), variantOf('v2', 'azul', 'A')]);
    await choose('Activo');
    button('Cambiar estado')?.click();
    await settle();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Azul');
  });

  // FR-023: se archiva, no se borra; antes se confirma.
  it('archivar pide confirmación, archiva y vuelve al catálogo', async () => {
    dialog.open.mockReturnValue({ afterClosed: () => of(true) });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const { button } = await render([variantOf('v1', 'rojo', 'R')]);
    button('Archivar producto')?.click();
    await settle();
    expect(commands.archiveProduct).toHaveBeenCalledWith(T1, { productId: 'p1', version: 2 });
    expect(navigate).toHaveBeenCalledWith(['/t', 't1', 'catalog']);
  });

  it('si no se confirma, no archiva', async () => {
    dialog.open.mockReturnValue({ afterClosed: () => of(false) });
    const { button } = await render([variantOf('v1', 'rojo', 'R')]);
    button('Archivar producto')?.click();
    await settle();
    expect(commands.archiveProduct).not.toHaveBeenCalled();
  });

  // T080 (002, Historia 3) — FR-028: el aviso de archivado dice de qué secciones sale, antes de confirmar.
  it.each([
    [{ featured: ['p1'], offers: ['p1'] }, 'Sale de Destacados y de Ofertas, y libera sus lugares.'],
    [{ featured: [], offers: ['p1'] }, 'Sale de Ofertas, y libera su lugar.'],
  ])('archivar uno que está en secciones lo avisa (%o)', async (sections, warning) => {
    dialog.open.mockReturnValue({ afterClosed: () => of(false) });
    const { button } = await render([variantOf('v1', 'rojo', 'R')]);
    fixtureRef.componentRef.setInput('sections', { featured: sections.featured.map(productId), offers: sections.offers.map(productId) });
    await settle();
    button('Archivar producto')?.click();
    await settle();
    expect(dialog.open.mock.calls[0]?.[1]?.data?.message).toContain(warning);
  });

  it('archivar uno que no está en ninguna sección no menciona secciones', async () => {
    dialog.open.mockReturnValue({ afterClosed: () => of(false) });
    const { button } = await render([variantOf('v1', 'rojo', 'R')]);
    button('Archivar producto')?.click();
    await settle();
    expect(dialog.open.mock.calls[0]?.[1]?.data?.message).not.toContain('libera');
  });
});

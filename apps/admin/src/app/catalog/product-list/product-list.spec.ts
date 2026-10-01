import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { CATALOG_QUERIES } from '../../core/client';
import { FakeCatalogQueries, product, T1 } from '../../../testing/fakes';
import { settle } from '../../../testing/settle';
import { CreateProductDialog } from '../create-product/create-product-dialog';
import { PAGE_SIZE, ProductList } from './product-list';

// T054 — el listado del catálogo, con sus tres estados (FR-036, FR-037; SC-012).
describe('ProductList', () => {
  let queries: FakeCatalogQueries;
  const dialog = { open: vi.fn() };

  beforeEach(() => {
    queries = new FakeCatalogQueries();
    dialog.open.mockReset().mockReturnValue({ afterClosed: () => of(undefined) });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 't/:tenantId/catalog', component: ProductList }], withComponentInputBinding()),
        { provide: CATALOG_QUERIES, useValue: queries },
        { provide: MatDialog, useValue: dialog },
      ],
    });
  });

  async function open() {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/t/t1/catalog');
    await settle();
    const root = harness.routeNativeElement as HTMLElement;
    const button = (text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
    return { root, button };
  }

  it('mientras carga muestra un esqueleto, anunciado una sola vez', async () => {
    const { root } = await open();
    const skeleton = root.querySelector('ui-skeleton');
    expect(skeleton?.getAttribute('role')).toBe('status');
    expect(skeleton?.textContent).toContain('Cargando el catálogo');
  });

  it('pide los productos del comercio de la ruta, sin filtros y con el tope de una página', async () => {
    await open();
    expect(queries.productList.params).toEqual({ tenantId: T1, query: { limit: PAGE_SIZE } });
  });

  it('lista nombre, estado, variantes y si a alguna le falta el SKU', async () => {
    const { root } = await open();
    queries.productList.emit([
      product('p1', 'Camiseta', { status: 'active', variantCount: 4, hasIncompleteVariants: false }),
      product('p2', 'Taza'),
    ]);
    await settle();

    const items = [...root.querySelectorAll('li')].map((li) => [...li.children].map((part) => part.textContent?.trim()));
    expect(items).toEqual([
      ['Camiseta', 'Activo · 4 variantes'],
      ['Taza', 'Borrador · 1 variante', 'Variantes sin SKU'],
    ]);
    expect(root.querySelector('ui-skeleton')).toBeNull();
  });

  it('si falla, lo dice y el reintento vuelve a pedir', async () => {
    const { root } = await open();
    queries.productList.fail(new Error('sin red'));
    await settle();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('No pudimos cargar el catálogo');

    root.querySelector<HTMLButtonElement>('[role="alert"] button')?.click();
    await settle();
    expect(queries.productLists).toHaveLength(2);
    expect(queries.productLists[0]?.closed).toBe(true);
  });

  it('sin productos invita a crear el primero', async () => {
    const { root, button } = await open();
    queries.productList.emit([]);
    await settle();
    expect(root.querySelector('ui-empty-state')?.textContent).toContain('Todavía no hay productos');

    button('Crear producto')?.click();
    expect(dialog.open).toHaveBeenCalledWith(CreateProductDialog, expect.objectContaining({ data: { tenantId: T1 } }));
  });

  it('busca por nombre después de una pausa al escribir', async () => {
    const { root } = await open();
    const search = root.querySelector<HTMLInputElement>('input[type="search"]');
    if (!search) throw new Error('No hay buscador');
    search.value = 'cafe';
    search.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    await settle();
    expect(queries.productList.params.query).toEqual({ limit: PAGE_SIZE, search: 'cafe' });
  });

  it('filtra por estado', async () => {
    const { root } = await open();
    const status = root.querySelector<HTMLSelectElement>('select');
    if (!status) throw new Error('No hay filtro de estado');
    status.value = 'active';
    status.dispatchEvent(new Event('input'));
    status.dispatchEvent(new Event('change'));
    await settle();
    expect(queries.productList.params.query).toEqual({ limit: PAGE_SIZE, status: 'active' });
  });

  it('con filtros y sin resultados, ofrece quitarlos en lugar de invitar a crear', async () => {
    const { root, button } = await open();
    const search = root.querySelector<HTMLInputElement>('input[type="search"]');
    if (!search) throw new Error('No hay buscador');
    search.value = 'nada';
    search.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    await settle();
    queries.productList.emit([]);
    await settle();
    expect(root.querySelector('ui-empty-state')?.textContent).toContain('Ningún producto coincide');

    button('Quitar filtros')?.click();
    await settle();
    expect(queries.productList.params.query).toEqual({ limit: PAGE_SIZE });
  });

  it('con una página llena ofrece cargar más, sin perder lo que ya se ve', async () => {
    const { root, button } = await open();
    queries.productList.emit(Array.from({ length: PAGE_SIZE }, (_, i) => product(`p${i}`, `Producto ${i}`)));
    await settle();

    button('Cargar más')?.click();
    await settle();
    expect(queries.productList.params.query).toEqual({ limit: 2 * PAGE_SIZE });
    expect(root.querySelectorAll('li')).toHaveLength(PAGE_SIZE);
    expect(root.querySelector('ul')?.getAttribute('aria-busy')).toBe('true');
  });

  it('una página incompleta no ofrece cargar más', async () => {
    const { button } = await open();
    queries.productList.emit([product('p1', 'Camiseta')]);
    await settle();
    expect(button('Cargar más')).toBeUndefined();
  });
});

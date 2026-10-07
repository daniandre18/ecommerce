import { LiveAnnouncer } from '@angular/cdk/a11y';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { productId, type MemberAccess } from '@ecommerce/domain';
import { CATALOG_COMMANDS, CATALOG_QUERIES } from '../../core/client';
import { CURRENT_ACCESS } from '../../tenant/current-access';
import { CATALOG_ACCESS, categoryTree, fakeCatalogCommands, FakeCatalogQueries, OWNER_ACCESS, product, provideAccess, READ_ONLY_ACCESS, T1, useAccess } from '../../../testing/fakes';
import { settle } from '../../../testing/settle';
import { CreateProductDialog } from '../create-product/create-product-dialog';
import { PAGE_SIZE, ProductList } from './product-list';

// T054 — el listado del catálogo, con sus tres estados (FR-036, FR-037; SC-012).
describe('ProductList', () => {
  let queries: FakeCatalogQueries;
  let commands: ReturnType<typeof fakeCatalogCommands>;
  const dialog = { open: vi.fn() };
  const announcer = { announce: vi.fn(async () => undefined) };

  beforeEach(() => {
    queries = new FakeCatalogQueries();
    commands = fakeCatalogCommands();
    announcer.announce.mockClear();
    dialog.open.mockReset().mockReturnValue({ afterClosed: () => of(undefined) });
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 't/:tenantId/catalog', component: ProductList },
            { path: 't/:tenantId/catalog/:productId', component: ProductList },
          ],
          withComponentInputBinding(),
        ),
        { provide: CATALOG_QUERIES, useValue: queries },
        { provide: CATALOG_COMMANDS, useValue: commands },
        { provide: LiveAnnouncer, useValue: announcer },
        { provide: MatDialog, useValue: dialog },
        provideAccess(),
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

    const items = [...root.querySelectorAll('li a')].map((link) => [...link.children].map((part) => part.textContent?.trim()));
    // Los dos nacen sin peso: la 002 los marca para completar (FR-017).
    expect(items).toEqual([
      ['Camiseta', 'Activo · 4 variantes', 'Faltan datos de envío'],
      ['Taza', 'Borrador · 1 variante', 'Variantes sin SKU', 'Faltan datos de envío'],
    ]);
    expect(root.querySelector('ui-skeleton')).toBeNull();
    expect(root.querySelector('li a')?.getAttribute('href')).toBe('/t/t1/catalog/p1');
  });

  // Las casillas para seleccionar dependen del acceso (Historia 2 de la 002): si llegara después de los
  // productos, correrían cada fila. El listado espera a saberlo (salto hallado por loading-states).
  it('hasta saber qué puede hacer la cuenta, sigue el esqueleto aunque los productos ya llegaron', async () => {
    const access = signal<MemberAccess | null | undefined>(undefined);
    TestBed.overrideProvider(CURRENT_ACCESS, { useValue: access });
    const { root } = await open();
    queries.productList.emit([product('p1', 'Camiseta')]);
    await settle();
    expect(root.querySelector('li')).toBeNull();
    expect(root.querySelector('ui-skeleton')).not.toBeNull();
    access.set(OWNER_ACCESS);
    await settle();
    expect(root.querySelector('input[type="checkbox"][aria-label="Seleccionar «Camiseta»"]')).not.toBeNull();
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

  // T079: sin catalog.write no se ofrece crear; el listado se ve igual.
  it('sin permiso para escribir el catálogo, no ofrece crear', async () => {
    useAccess(READ_ONLY_ACCESS);
    const { root, button } = await open();
    queries.productList.emit([]);
    await settle();
    expect(root.querySelector('ui-empty-state')?.textContent).toContain('Todavía no hay productos');
    expect(root.querySelector('ui-empty-state')?.textContent).not.toContain('Creá el primero');
    expect(button('Crear producto')).toBeUndefined();
    expect(button('Nuevo producto')).toBeUndefined();
  });

  it('después de crear, abre el editor del producto nuevo para armar sus variantes', async () => {
    dialog.open.mockReturnValue({ afterClosed: () => of({ productId: 'p9', variantId: 'v9', name: 'Taza' }) });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    const { button } = await open();
    button('Nuevo producto')?.click();
    await settle();
    expect(navigate).toHaveBeenCalledWith(['p9'], expect.objectContaining({ relativeTo: expect.anything() }));
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

  // T041 (002) — FR-017 y FR-035: los filtros de la ficha de tienda, de a uno.
  describe('filtros de la ficha de tienda', () => {
    const choose = async (root: HTMLElement, value: string) => {
      const show = root.querySelector<HTMLSelectElement>('[data-field="attribute"]');
      if (!show) throw new Error('No hay filtro "Mostrar"');
      show.value = value;
      show.dispatchEvent(new Event('input'));
      show.dispatchEvent(new Event('change'));
      await settle();
    };
    const typeValue = async (root: HTMLElement, value: string) => {
      const input = root.querySelector<HTMLInputElement>('[data-field="attributeValue"]');
      if (!input) throw new Error('No hay campo para el valor del filtro');
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await new Promise((resolve) => setTimeout(resolve, 350));
      await settle();
    };

    it('muestra solo los físicos a los que les faltan datos de envío', async () => {
      const { root } = await open();
      await choose(root, 'missing');
      expect(queries.productList.params.query).toEqual({ limit: PAGE_SIZE, missingShippingData: true });
    });

    it('filtra por etiqueta y por marca, de a una', async () => {
      const { root } = await open();
      await choose(root, 'tag');
      await typeValue(root, 'Verano');
      expect(queries.productList.params.query).toEqual({ limit: PAGE_SIZE, tag: 'Verano' });
      await choose(root, 'brand');
      expect(queries.productList.params.query).toEqual({ limit: PAGE_SIZE, brand: 'Verano' });
    });

    it('sin valor, elegir etiqueta todavía no filtra', async () => {
      const { root } = await open();
      await choose(root, 'tag');
      expect(queries.productList.params.query).toEqual({ limit: PAGE_SIZE });
    });

    // La búsqueda ordena por nombre: combinarla con estos filtros pediría otro índice por combinación.
    it('mientras se busca por nombre, los filtros de la ficha no se aplican y lo dice', async () => {
      const { root } = await open();
      await choose(root, 'missing');
      const search = root.querySelector<HTMLInputElement>('input[type="search"]');
      if (!search) throw new Error('No hay buscador');
      search.value = 'cafe';
      search.dispatchEvent(new Event('input'));
      await new Promise((resolve) => setTimeout(resolve, 350));
      await settle();
      expect(queries.productList.params.query).toEqual({ limit: PAGE_SIZE, search: 'cafe' });
      expect(root.querySelector<HTMLSelectElement>('[data-field="attribute"]')?.disabled).toBe(true);
      expect(root.textContent).toContain('La búsqueda por nombre no se combina con este filtro');
    });

    it('señala los productos a los que les faltan datos de envío (FR-017)', async () => {
      const { root } = await open();
      queries.productList.emit([
        product('p1', 'Camiseta', { missingShippingData: true }),
        product('p2', 'Licencia', { kind: 'digital', missingShippingData: false }),
      ]);
      await settle();
      const rows = [...root.querySelectorAll('li')].map((li) => li.textContent ?? '');
      expect(rows[0]).toContain('Faltan datos de envío');
      expect(rows[1]).not.toContain('Faltan datos de envío');
    });
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

  // T061 (002) — Historia 2: filtrar por una categoría incluye sus subcategorías (FR-023), y asignar
  // o quitar una categoría a los seleccionados en una sola acción (FR-025).
  describe('categorías', () => {
    const TREE = categoryTree([
      ['ropa', null, 'Ropa'],
      ['hombre', 'ropa', 'Hombre'],
      ['camisetas', 'hombre', 'Camisetas'],
      ['mujer', 'ropa', 'Mujer'],
      ['calzado', null, 'Calzado'],
    ]);
    const select = async (root: HTMLElement, field: string, value: string) => {
      const control = root.querySelector<HTMLSelectElement>(`[data-field="${field}"]`);
      if (!control) throw new Error(`No hay ${field}`);
      control.value = value;
      control.dispatchEvent(new Event('input'));
      control.dispatchEvent(new Event('change'));
      await settle();
    };
    const toggle = async (root: HTMLElement, label: string) => {
      const box = root.querySelector<HTMLInputElement>(`input[type="checkbox"][aria-label="${label}"]`);
      if (!box) throw new Error(`No hay casilla «${label}»`);
      box.click();
      await settle();
    };
    const listed = async (products = [product('p1', 'Camiseta'), product('p2', 'Taza'), product('p3', 'Plato')]) => {
      const opened = await open();
      queries.categoryTree.emit(TREE);
      queries.productList.emit(products);
      await settle();
      return opened;
    };

    it('filtrar por una categoría pide la rama entera: ella y todas sus subcategorías', async () => {
      const { root } = await listed();
      await select(root, 'attribute', 'category');
      const options = [...(root.querySelector<HTMLSelectElement>('[data-field="category"]')?.options ?? [])].map((o) => o.textContent?.trim());
      expect(options).toEqual(['Elegí una', 'Ropa', 'Ropa › Hombre', 'Ropa › Hombre › Camisetas', 'Ropa › Mujer', 'Calzado']);
      await select(root, 'category', 'ropa');
      const { query } = queries.productList.params;
      expect(query.limit).toBe(PAGE_SIZE);
      expect([...(query.categoryIds ?? [])].sort()).toEqual(['camisetas', 'hombre', 'mujer', 'ropa']);
    });

    it('sin elegir la categoría todavía no filtra', async () => {
      const { root } = await listed();
      await select(root, 'attribute', 'category');
      expect(queries.productList.params.query).toEqual({ limit: PAGE_SIZE });
    });

    it('quien solo lee el catálogo también filtra por categoría, pero no selecciona', async () => {
      useAccess(READ_ONLY_ACCESS);
      const { root } = await listed();
      await select(root, 'attribute', 'category');
      await select(root, 'category', 'calzado');
      expect(queries.productList.params.query.categoryIds).toEqual(['calzado']);
      expect(root.querySelector('input[type="checkbox"]')).toBeNull();
    });

    it('asigna una categoría a los seleccionados, en una acción, y lo anuncia', async () => {
      commands.assignCategory.mockResolvedValue({ ok: true, data: { changed: 2 } });
      const { root, button } = await listed();
      await toggle(root, 'Seleccionar «Camiseta»');
      await toggle(root, 'Seleccionar «Plato»');
      expect(root.textContent).toContain('2 seleccionados');
      await select(root, 'bulkCategory', 'mujer');
      button('Asignar')?.click();
      await settle();
      expect(commands.assignCategory).toHaveBeenCalledWith(T1, { categoryId: 'mujer', productIds: ['p1', 'p3'] });
      expect(announcer.announce).toHaveBeenCalledWith('«Ropa › Mujer» quedó asignada a los 2 productos seleccionados.');
      expect(root.querySelector<HTMLInputElement>('input[aria-label="Seleccionar «Camiseta»"]')?.checked).toBe(false);
    });

    it('el selector de la acción masiva se nombra solo por su etiqueta', async () => {
      const { root } = await listed();
      await toggle(root, 'Seleccionar «Taza»');
      expect(root.querySelector<HTMLSelectElement>('[data-field="bulkCategory"]')?.labels?.[0]?.textContent?.trim()).toBe('Categoría');
    });

    it('quita una categoría a los seleccionados', async () => {
      commands.unassignCategory.mockResolvedValue({ ok: true, data: { changed: 1 } });
      const { root, button } = await listed();
      await toggle(root, 'Seleccionar «Taza»');
      await select(root, 'bulkCategory', 'calzado');
      button('Quitar')?.click();
      await settle();
      expect(commands.unassignCategory).toHaveBeenCalledWith(T1, { categoryId: 'calzado', productIds: ['p2'] });
    });

    it('si a uno ya no le entra otra categoría, no se asigna a ninguno y lo nombra', async () => {
      commands.assignCategory.mockResolvedValue({ ok: false, code: 'limit-exceeded', message: 'x', details: { max: 20, productIds: ['p2'] } });
      const { root, button } = await listed();
      await toggle(root, 'Seleccionar «Camiseta»');
      await toggle(root, 'Seleccionar «Taza»');
      await select(root, 'bulkCategory', 'mujer');
      button('Asignar')?.click();
      await settle();
      expect(root.textContent).toContain('«Taza» ya tiene 20 categorías: no se asignó a ninguno');
      expect(root.querySelector<HTMLInputElement>('input[aria-label="Seleccionar «Camiseta»"]')?.checked).toBe(true);
    });

    it('hasta 100 productos por acción', async () => {
      const many = Array.from({ length: 101 }, (_, i) => product(`p${i}`, `Producto ${i}`));
      const { root, button } = await listed(many);
      await toggle(root, 'Seleccionar todos los de la lista');
      expect(root.textContent).toContain('101 seleccionados');
      expect(root.textContent).toContain('Una acción admite hasta 100 productos');
      await select(root, 'bulkCategory', 'mujer');
      expect(button('Asignar')?.disabled).toBe(true);
    });
  });

  // T081 (002) — Historia 3: el listado por sección (FR-027c) y las acciones masivas separadas por
  // permiso (FR-029): secciones con catalog.write, condiciones de venta con variant.price.write.
  describe('secciones y condiciones de venta', () => {
    const PRICE_ONLY: MemberAccess = { isOwner: false, permissions: ['catalog.read', 'variant.price.write'] };
    const LISTED = [product('p1', 'Camiseta', { status: 'active', version: 4 }), product('p2', 'Taza', { version: 7 }), product('p3', 'Plato', { status: 'unlisted', version: 2 })];
    const select = async (root: HTMLElement, field: string, value: string) => {
      const control = root.querySelector<HTMLSelectElement>(`[data-field="${field}"]`);
      if (!control) throw new Error(`No hay ${field}`);
      control.value = value;
      control.dispatchEvent(new Event('input'));
      control.dispatchEvent(new Event('change'));
      await settle();
    };
    const toggle = async (root: HTMLElement, label: string) => {
      const box = root.querySelector<HTMLInputElement>(`input[type="checkbox"][aria-label="${label}"]`);
      if (!box) throw new Error(`No hay casilla «${label}»`);
      box.click();
      await settle();
    };
    const listed = async (sections = { featured: [productId('p1'), productId('p3')], offers: [] as ReturnType<typeof productId>[] }) => {
      const opened = await open();
      queries.categoryTree.emit(categoryTree([]));
      queries.sections.emit(sections);
      queries.productList.emit(LISTED);
      await settle();
      return opened;
    };
    const text = (root: HTMLElement) => root.textContent?.replace(/\s+/g, ' ') ?? '';

    it('filtrar por sección pide sus productos por id, con el contador a la vista (FR-027a)', async () => {
      const { root } = await listed();
      const label = [...(root.querySelector<HTMLSelectElement>('[data-field="attribute"]')?.options ?? [])].find((o) => o.value === 'featured')?.textContent?.trim();
      expect(label).toBe('En Destacados (2 de 40)');
      await select(root, 'attribute', 'featured');
      expect(queries.productList.params.query).toEqual({ limit: PAGE_SIZE, productIds: ['p1', 'p3'] });
      expect(text(root)).toContain('Destacados: 2 de 40');
    });

    it('desde el listado por sección se quita un producto, y se señalan los que la tienda no muestra', async () => {
      commands.removeFromSection.mockResolvedValue({ ok: true, data: { section: 'featured', count: 1 } });
      const { root } = await listed();
      await select(root, 'attribute', 'featured');
      queries.productList.emit([LISTED[0], LISTED[2]].filter((p) => p !== undefined));
      await settle();
      const rows = [...root.querySelectorAll('li')].map((li) => li.textContent?.replace(/\s+/g, ' ') ?? '');
      expect(rows[0]).not.toContain('La tienda no lo muestra');
      expect(rows[1]).toContain('La tienda no lo muestra: está no listado');
      // A la vista dice "Quitar de Destacados"; el nombre accesible distingue cada fila.
      expect(root.querySelector('button[aria-label="Quitar «Plato» de Destacados"]')?.textContent?.trim()).toBe('Quitar de Destacados');
      root.querySelector<HTMLButtonElement>('button[aria-label="Quitar «Plato» de Destacados"]')?.click();
      await settle();
      expect(commands.removeFromSection).toHaveBeenCalledWith(T1, { section: 'featured', productIds: ['p3'] });
    });

    it('agregar a una sección en masa; sin lugar para todos se rechaza entera y dice cuántos quedan (FR-027b)', async () => {
      commands.addToSection.mockResolvedValue({ ok: false, code: 'section-full', message: 'x', details: { section: 'offers', remaining: 1, requested: 2 } });
      const { root, button } = await listed();
      await toggle(root, 'Seleccionar «Camiseta»');
      await toggle(root, 'Seleccionar «Taza»');
      await select(root, 'bulkSection', 'offers');
      button('Agregar a la sección')?.click();
      await settle();
      expect(commands.addToSection).toHaveBeenCalledWith(T1, { section: 'offers', productIds: ['p1', 'p2'] });
      expect(text(root)).toContain('Ofertas no tiene lugar para los 2: queda 1 lugar. No se agregó ninguno.');
      expect(root.querySelector<HTMLInputElement>('input[aria-label="Seleccionar «Camiseta»"]')?.checked).toBe(true);
    });

    it('las condiciones de venta se cambian en masa con la versión de cada producto', async () => {
      commands.setSaleConditions.mockResolvedValue({ ok: true, data: { batchId: 'b1', updated: 2, auditEntryIds: ['e1', 'e2'] } });
      const { root, button } = await listed();
      await toggle(root, 'Seleccionar «Camiseta»');
      await toggle(root, 'Seleccionar «Taza»');
      button('Ocultar el precio')?.click();
      await settle();
      expect(commands.setSaleConditions).toHaveBeenCalledWith(T1, {
        changes: [
          { productId: 'p1', version: 4 },
          { productId: 'p2', version: 7 },
        ],
        priceVisible: false,
      });
    });

    it('envío gratis con digitales: los nombra, y quitarlos de la selección reintenta con el resto (FR-029)', async () => {
      commands.setSaleConditions
        .mockResolvedValueOnce({ ok: false, code: 'digital-products', message: 'x', details: { productIds: ['p2'], names: ['Taza'] } })
        .mockResolvedValueOnce({ ok: true, data: { batchId: 'b1', updated: 2, auditEntryIds: ['e1', 'e2'] } });
      const { root, button } = await listed();
      for (const name of ['Camiseta', 'Taza', 'Plato']) await toggle(root, `Seleccionar «${name}»`);
      button('Activar envío gratis')?.click();
      await settle();
      expect(text(root)).toContain('«Taza» es digital: el envío gratis no se ofrece en productos digitales. No se aplicó a ninguno.');

      button('Quitar de la selección y reintentar')?.click();
      await settle();
      expect(commands.setSaleConditions).toHaveBeenLastCalledWith(T1, {
        changes: [
          { productId: 'p1', version: 4 },
          { productId: 'p3', version: 2 },
        ],
        freeShipping: true,
      });
      expect(root.querySelector<HTMLInputElement>('input[aria-label="Seleccionar «Taza»"]')?.checked).toBe(false);
    });

    it('el rol de Catálogo no ve las condiciones de venta; sí las secciones', async () => {
      useAccess(CATALOG_ACCESS);
      const { root, button } = await listed();
      await toggle(root, 'Seleccionar «Camiseta»');
      expect(button('Ocultar el precio')).toBeUndefined();
      expect(root.querySelector('[data-field="bulkSection"]')).not.toBeNull();
    });

    it('con solo permiso de precios selecciona y cambia condiciones, sin categorías ni secciones', async () => {
      useAccess(PRICE_ONLY);
      const { root, button } = await listed();
      await toggle(root, 'Seleccionar «Camiseta»');
      expect(button('Ocultar el precio')).toBeDefined();
      expect(root.querySelector('[data-field="bulkSection"]')).toBeNull();
      expect(root.querySelector('[data-field="bulkCategory"]')).toBeNull();
    });
  });
});

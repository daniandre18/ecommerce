import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { createIncompleteVariant, productId, variantId, type Tenant } from '@ecommerce/domain';
import { CATALOG_COMMANDS, CATALOG_QUERIES, IMAGE_STORAGE } from '../../core/client';
import { CURRENT_TENANT } from '../../tenant/current-tenant';
import { fakeCatalogCommands, FakeCatalogQueries, FakeImageStorage, product, provideAccess, READ_ONLY_ACCESS, T1, tenant, useAccess } from '../../../testing/fakes';
import { settle } from '../../../testing/settle';
import { ProductEditor } from './product-editor';

describe('ProductEditor', () => {
  let queries: FakeCatalogQueries;
  const current = signal<Tenant | undefined>(tenant());

  beforeEach(() => {
    queries = new FakeCatalogQueries();
    TestBed.configureTestingModule({
      providers: [
        provideAccess(),
        provideRouter([{ path: 't/:tenantId/catalog/:productId', component: ProductEditor }], withComponentInputBinding()),
        { provide: CATALOG_QUERIES, useValue: queries },
        { provide: CATALOG_COMMANDS, useValue: fakeCatalogCommands() },
        { provide: CURRENT_TENANT, useValue: current },
        { provide: IMAGE_STORAGE, useValue: new FakeImageStorage() },
      ],
    });
  });

  async function open() {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/t/t1/catalog/p1');
    await settle();
    return harness.routeNativeElement as HTMLElement;
  }

  it('escucha el producto y sus variantes de la ruta, y muestra un esqueleto mientras llegan', async () => {
    const root = await open();
    expect(queries.products.map((s) => s.params)).toEqual([{ tenantId: T1, productId: 'p1' }]);
    expect(queries.variantLists.map((s) => s.params)).toEqual([{ tenantId: T1, productId: 'p1' }]);
    expect(root.querySelector('ui-skeleton')).not.toBeNull();
  });

  it('con el producto y sus variantes, muestra los datos, las opciones y la tabla', async () => {
    const root = await open();
    queries.products[0]?.emit(product('p1', 'Camiseta'));
    queries.variantLists[0]?.emit([{ ...createIncompleteVariant({ id: variantId('v1'), tenantId: T1, productId: productId('p1'), optionValues: {} }), version: 1 }]);
    await settle();
    expect(root.querySelector('h1')?.textContent).toContain('Camiseta');
    expect([...root.querySelectorAll('h2')].map((h) => h.textContent?.trim())).toEqual(['Datos', 'Estado', 'Opciones de variación', 'Variantes (1)']);
    expect(root.querySelector('h3')?.textContent?.trim()).toBe('Imágenes del producto');
    expect(root.querySelector('[role="group"]')?.textContent).toContain('Única');
  });

  // T079: sin catalog.write no se ofrecen el estado ni las opciones; los datos y las variantes, sí.
  it('sin permiso para escribir el catálogo, no ofrece cambiar el estado ni las opciones', async () => {
    useAccess(READ_ONLY_ACCESS);
    const root = await open();
    queries.products[0]?.emit(product('p1', 'Camiseta'));
    queries.variantLists[0]?.emit([{ ...createIncompleteVariant({ id: variantId('v1'), tenantId: T1, productId: productId('p1'), optionValues: {} }), version: 1 }]);
    await settle();
    expect([...root.querySelectorAll('h2')].map((h) => h.textContent?.trim())).toEqual(['Datos', 'Variantes (1)']);
  });

  it('un producto que no existe lo dice y ofrece volver al catálogo', async () => {
    const root = await open();
    queries.products[0]?.emit(null);
    await settle();
    expect(root.querySelector('ui-empty-state')?.textContent).toContain('Este producto no existe');
    expect(root.querySelector('ui-empty-state a')?.getAttribute('href')).toBe('/t/t1/catalog');
  });

  it('si falla la lectura, lo dice y el reintento vuelve a pedir', async () => {
    const root = await open();
    queries.products[0]?.fail(new Error('sin red'));
    await settle();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('No pudimos cargar el producto');
    root.querySelector<HTMLButtonElement>('[role="alert"] button')?.click();
    await settle();
    expect(queries.products).toHaveLength(2);
  });
});

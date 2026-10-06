import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { categoryId, createIncompleteVariant, emptySections, productId, variantId, type MemberAccess, type Tenant } from '@ecommerce/domain';
import { CATALOG_COMMANDS, CATALOG_QUERIES, IMAGE_STORAGE } from '../../core/client';
import { CURRENT_ACCESS } from '../../tenant/current-access';
import { CURRENT_TENANT } from '../../tenant/current-tenant';
import {
  categoryTree,
  fakeCatalogCommands,
  FakeCatalogQueries,
  FakeImageStorage,
  OWNER_ACCESS,
  product,
  provideAccess,
  READ_ONLY_ACCESS,
  T1,
  tenant,
  useAccess,
} from '../../../testing/fakes';
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

  const variant = () => [{ ...createIncompleteVariant({ id: variantId('v1'), tenantId: T1, productId: productId('p1'), optionValues: {} }), version: 1 }];
  /** Llega todo lo que el editor espera antes de mostrarse: producto, variantes y árbol de categorías. */
  const arrive = async (tree = categoryTree([])) => {
    queries.products[0]?.emit(product('p1', 'Camiseta'));
    queries.variantLists[0]?.emit(variant());
    queries.categoryTree.emit(tree);
    queries.sections.emit(emptySections());
    await settle();
  };

  it('escucha el producto y sus variantes de la ruta, y muestra un esqueleto mientras llegan', async () => {
    const root = await open();
    expect(queries.products.map((s) => s.params)).toEqual([{ tenantId: T1, productId: 'p1' }]);
    expect(queries.variantLists.map((s) => s.params)).toEqual([{ tenantId: T1, productId: 'p1' }]);
    expect(root.querySelector('ui-skeleton')).not.toBeNull();
  });

  it('con el producto y sus variantes, muestra los datos, las opciones y la tabla', async () => {
    const root = await open();
    await arrive();
    expect(root.querySelector('h1')?.textContent).toContain('Camiseta');
    expect([...root.querySelectorAll('h2')].map((h) => h.textContent?.trim())).toEqual(['Datos', 'En la tienda', 'Tipo y envío', 'Cómo se ofrece', 'Categorías', 'Estado', 'Opciones de variación', 'Variantes (1)']);
    expect(root.querySelector('h3')?.textContent?.trim()).toBe('Imágenes del producto');
    expect(root.querySelector('[role="group"]')?.textContent).toContain('Única');
  });

  // T079: sin catalog.write no se ofrecen el estado ni las opciones; los datos y las variantes, sí.
  it('sin permiso para escribir el catálogo, no ofrece cambiar el estado ni las opciones', async () => {
    useAccess(READ_ONLY_ACCESS);
    const root = await open();
    await arrive();
    expect([...root.querySelectorAll('h2')].map((h) => h.textContent?.trim())).toEqual(['Datos', 'En la tienda', 'Tipo y envío', 'Cómo se ofrece', 'Categorías', 'Variantes (1)']);
  });

  // Hallado por loading-states.spec.ts (falló 1 de 6 con un salto de 0,029): si el acceso de la cuenta
  // llegaba después que el producto, lo que depende de él —el enlace a la bitácora, los botones de
  // guardar, el estado— aparecía de golpe y empujaba todo. El editor espera a saberlo.
  it('hasta saber qué puede hacer la cuenta, sigue el esqueleto aunque el producto ya llegó', async () => {
    const access = signal<MemberAccess | null | undefined>(undefined);
    TestBed.overrideProvider(CURRENT_ACCESS, { useValue: access });
    const root = await open();
    await arrive();
    expect(root.querySelector('h1')).toBeNull();
    expect(root.querySelector('ui-skeleton')).not.toBeNull();

    access.set(OWNER_ACCESS);
    await settle();
    expect(root.querySelector('h1')?.textContent).toContain('Camiseta');
    expect(root.textContent).toContain('Ver sus cambios en la bitácora');
  });

  // Lo mismo con las categorías: los chips de un producto con categorías aparecían cuando llegaba el
  // árbol, después del resto, y empujaban las secciones de abajo.
  it('hasta que llega el árbol de categorías, sigue el esqueleto', async () => {
    const root = await open();
    queries.products[0]?.emit(product('p1', 'Camiseta', { categoryIds: [categoryId('ropa')] }));
    queries.variantLists[0]?.emit(variant());
    await settle();
    expect(root.querySelector('h1')).toBeNull();

    queries.categoryTree.emit(categoryTree([['ropa', null, 'Ropa']]));
    queries.sections.emit(emptySections());
    await settle();
    expect(root.querySelector('app-categories-section .chip-label')?.textContent?.trim()).toBe('Ropa');
  });

  // Historia 3: la marca "en borrador dentro de una sección" depende del documento de secciones; si
  // llegara después, aparecería de golpe y empujaría lo de abajo.
  it('hasta que llegan las secciones destacadas, sigue el esqueleto', async () => {
    const root = await open();
    queries.products[0]?.emit(product('p1', 'Camiseta'));
    queries.variantLists[0]?.emit(variant());
    queries.categoryTree.emit(categoryTree([]));
    await settle();
    expect(root.querySelector('h1')).toBeNull();

    queries.sections.emit({ featured: [productId('p1')], offers: [] });
    await settle();
    expect(root.querySelector('app-presentation-section')?.textContent).toContain('La tienda no lo muestra en Destacados');
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

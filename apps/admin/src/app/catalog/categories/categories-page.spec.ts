import { LiveAnnouncer } from '@angular/cdk/a11y';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { OverlayContainer } from '@angular/cdk/overlay';
import { By } from '@angular/platform-browser';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { categoryId, moveCategory, type CategoryId, type CategoryTree, type MemberAccess } from '@ecommerce/domain';
import { CATALOG_COMMANDS, CATALOG_QUERIES } from '../../core/client';
import { PendingChanges } from '../../shared/pending-changes/pending-changes';
import { CURRENT_ACCESS } from '../../tenant/current-access';
import { categoryTree, fakeCatalogCommands, FakeCatalogQueries, OWNER_ACCESS, provideAccess, READ_ONLY_ACCESS, T1, useAccess } from '../../../testing/fakes';
import { settle } from '../../../testing/settle';
import { CategoriesPage } from './categories-page';

const DONE = { ok: true as const, data: {} };

/** Ropa > Hombre > (Camisetas, Camisas), Ropa > Mujer, Calzado. */
const STORE = (hidden: string[] = []): CategoryTree =>
  categoryTree(
    [
      ['ropa', null, 'Ropa'],
      ['hombre', 'ropa', 'Hombre'],
      ['camisetas', 'hombre', 'Camisetas'],
      ['camisas', 'hombre', 'Camisas'],
      ['mujer', 'ropa', 'Mujer'],
      ['calzado', null, 'Calzado'],
    ],
    hidden,
  );

// T059 — Historia 2: el editor del árbol de categorías (FR-019 a FR-021a, FR-024).
describe('CategoriesPage', () => {
  let queries: FakeCatalogQueries;
  let commands: ReturnType<typeof fakeCatalogCommands>;
  const announcer = { announce: vi.fn(async () => undefined) };

  beforeEach(() => {
    queries = new FakeCatalogQueries();
    commands = fakeCatalogCommands();
    for (const name of ['renameCategory', 'setCategorySlug', 'moveCategory', 'setCategoryHidden', 'deleteCategory'] as const) {
      commands[name].mockResolvedValue(DONE);
    }
    commands.createCategory.mockResolvedValue({ ok: true, data: { categoryId: 'nueva', slug: 'nueva' } });
    announcer.announce.mockClear();
    TestBed.configureTestingModule({
      imports: [CategoriesPage],
      providers: [
        provideAccess(),
        { provide: CATALOG_QUERIES, useValue: queries },
        { provide: CATALOG_COMMANDS, useValue: commands },
        { provide: LiveAnnouncer, useValue: announcer },
      ],
    });
  });

  async function render(tree: CategoryTree | null = STORE()) {
    const fixture = TestBed.createComponent(CategoriesPage);
    fixture.componentRef.setInput('tenantId', 't1');
    await settle();
    if (tree) {
      queries.categoryTree.emit(tree);
      await settle();
    }
    const root = fixture.nativeElement as HTMLElement;
    const row = (id: string) => {
      const found = root.querySelector<HTMLElement>(`li[data-category="${id}"]`);
      if (!found) throw new Error(`No hay fila ${id}`);
      return found;
    };
    /** Cada fila del árbol, en orden: id, nivel, nombre, URL y su estado de visibilidad. */
    const rows = () =>
      [...root.querySelectorAll<HTMLElement>('li[data-category]')].map((li) => [
        li.dataset['category'],
        Number(li.getAttribute('aria-level')),
        li.querySelector(':scope > .row .category-name')?.textContent?.trim(),
        li.querySelector(':scope > .row .category-state')?.textContent?.trim() ?? '',
      ]);
    const text = () => root.textContent?.replace(/\s+/g, ' ') ?? '';
    const field = <T extends HTMLElement = HTMLInputElement>(name: string, scope: HTMLElement = root) => {
      const found = scope.querySelector<T>(`[data-field="${name}"]`);
      if (!found) throw new Error(`No hay campo ${name}`);
      return found;
    };
    const type = async (name: string, value: string, scope: HTMLElement = root) => {
      const input = field<HTMLInputElement | HTMLSelectElement>(name, scope);
      input.value = value;
      input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input'));
      await settle();
    };
    const button = (label: string, scope: HTMLElement = root) => [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
    const click = async (label: string, scope: HTMLElement = root) => {
      const target = button(label, scope);
      if (!target) throw new Error(`No hay botón «${label}»`);
      target.click();
      await settle();
    };
    /** Abre el menú de acciones de una fila y elige una. */
    const act = async (id: string, action: string) => {
      const trigger = row(id).querySelector<HTMLButtonElement>(':scope > .row button.actions');
      if (!trigger) throw new Error(`La fila ${id} no ofrece acciones`);
      trigger.click();
      await settle();
      const overlay = TestBed.inject(OverlayContainer).getContainerElement();
      const item = [...overlay.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((i) => i.textContent?.trim() === action);
      if (!item) throw new Error(`No hay acción «${action}» en ${id}`);
      item.click();
      await settle();
    };
    return { fixture, root, row, rows, text, field, type, button, click, act };
  }

  it('mientras carga muestra un esqueleto', async () => {
    const { root } = await render(null);
    expect(root.querySelector('ui-skeleton')?.textContent).toContain('Cargando las categorías');
  });

  it('muestra el árbol anidado, con la URL de cada una (FR-019)', async () => {
    const { rows, row } = await render();
    expect(rows().map(([id, level, name]) => [id, level, name])).toEqual([
      ['ropa', 1, 'Ropa'],
      ['hombre', 2, 'Hombre'],
      ['camisetas', 3, 'Camisetas'],
      ['camisas', 3, 'Camisas'],
      ['mujer', 2, 'Mujer'],
      ['calzado', 1, 'Calzado'],
    ]);
    expect(row('camisetas').querySelector('.category-slug')?.textContent).toContain('…/camisetas');
  });

  // Hallado por la e2e: un <label> que envuelve al <select> nombra al control con el texto de todas
  // sus opciones, y una búsqueda por etiqueta encuentra el selector equivocado.
  it('cada selector se nombra solo por su etiqueta, sin el texto de sus opciones', async () => {
    const { field, act, row } = await render();
    const label = (name: string, scope?: HTMLElement) => field<HTMLSelectElement>(name, scope).labels?.[0]?.textContent?.trim();
    expect([label('newParent'), label('visibility')]).toEqual(['Dentro de', 'Mostrar']);
    await act('camisetas', 'Mover a…');
    expect(label('destination', row('camisetas'))).toBe('Mover a');
  });

  // Como en el editor (salto hallado por loading-states.spec.ts): el alta y las acciones dependen del
  // acceso; si apareciera después del árbol, empujaría la vista.
  it('hasta saber qué puede hacer la cuenta, sigue el esqueleto aunque el árbol ya llegó', async () => {
    const access = signal<MemberAccess | null | undefined>(undefined);
    TestBed.overrideProvider(CURRENT_ACCESS, { useValue: access });
    const { root } = await render();
    expect(root.querySelector('li[data-category]')).toBeNull();
    expect(root.querySelector('ui-skeleton')).not.toBeNull();
    access.set(OWNER_ACCESS);
    await settle();
    expect(root.querySelector('[data-field="newName"]')).not.toBeNull();
    expect(root.querySelectorAll('li[data-category]')).toHaveLength(6);
  });

  it('sin categorías, invita a crear la primera', async () => {
    const { text } = await render(categoryTree([]));
    expect(text()).toContain('Todavía no hay categorías');
  });

  describe('crear (FR-021)', () => {
    it('muestra la URL resultante antes de confirmar: "Camisas" en Mujer recibe camisas-2', async () => {
      const { type, root } = await render();
      await type('newName', 'Camisas');
      await type('newParent', 'mujer');
      expect(root.querySelector('.slug-preview')?.textContent).toContain('Su URL será …/camisas-2');
    });

    it('se puede corregir en el momento; una tomada se avisa y no se crea', async () => {
      const { type, root, button } = await render();
      await type('newName', 'Camisas');
      await type('newSlug', 'Camisas Mujer');
      expect(root.querySelector('.slug-preview')?.textContent).toContain('Su URL será …/camisas-mujer');
      await type('newSlug', 'hombre');
      expect(root.querySelector('.slug-preview')?.textContent).toContain('La usa otra categoría');
      expect(button('Crear categoría')?.disabled).toBe(true);
    });

    it('crea con el nombre, el padre y una requestId nueva', async () => {
      const { type, click } = await render();
      await type('newName', 'Polos');
      await type('newParent', 'hombre');
      await click('Crear categoría');
      expect(commands.createCategory).toHaveBeenCalledWith(T1, { parentId: 'hombre', name: 'Polos', requestId: expect.any(String) });
    });

    it('no ofrece como padre a una del tercer nivel', async () => {
      const { field } = await render();
      const options = [...field<HTMLSelectElement>('newParent').options].map((o) => o.value);
      expect(options).toEqual(['', 'ropa', 'hombre', 'mujer', 'calzado']);
    });

    it('un error del servidor se muestra y lo escrito se conserva', async () => {
      commands.createCategory.mockResolvedValue({ ok: false, code: 'category-name-taken', message: 'x' });
      const { type, click, text, field } = await render();
      await type('newName', 'Hombre');
      await type('newParent', 'ropa');
      await click('Crear categoría');
      expect(text()).toContain('Ya hay una categoría con ese nombre en el mismo lugar');
      expect(field('newName').value).toBe('Hombre');
    });

    it('lo escrito sin crear queda pendiente', async () => {
      const { type } = await render();
      await type('newName', 'Polos');
      expect(TestBed.inject(PendingChanges).any()).toBe(true);
    });
  });

  it('renombrar no toca la URL (FR-021)', async () => {
    const { act, type, click, row } = await render();
    await act('hombre', 'Renombrar');
    await type('rename', 'Caballeros', row('hombre'));
    await click('Guardar', row('hombre'));
    expect(commands.renameCategory).toHaveBeenCalledWith(T1, { categoryId: 'hombre', name: 'Caballeros' });
  });

  it('cambiar la URL avisa si la usa otra', async () => {
    const { act, type, click, row } = await render();
    await act('hombre', 'Cambiar URL');
    await type('slug', 'mujer', row('hombre'));
    expect(row('hombre').textContent).toContain('La usa otra categoría');
    await type('slug', 'caballeros', row('hombre'));
    await click('Guardar', row('hombre'));
    expect(commands.setCategorySlug).toHaveBeenCalledWith(T1, { categoryId: 'hombre', slug: 'caballeros' });
  });

  // FR-021a en el panel: el aviso dice cuántas quedan ocultas, la orden escribe solo esa categoría, y
  // cada fila distingue "oculta" de "oculta por su categoría padre".
  describe('visibilidad (FR-021a)', () => {
    it('ocultar una con subcategorías avisa cuántas quedan ocultas antes de confirmar', async () => {
      const { act, row, click } = await render();
      await act('ropa', 'Ocultar');
      expect(row('ropa').textContent).toContain('También quedan ocultas en la tienda sus 4 subcategorías');
      expect(commands.setCategoryHidden).not.toHaveBeenCalled();
      await click('Ocultar', row('ropa'));
      // Una sola orden, para esa categoría: nada se escribe en sus descendientes.
      expect(commands.setCategoryHidden.mock.calls).toEqual([[T1, { categoryId: 'ropa', hidden: true }]]);
    });

    it('una sin subcategorías se oculta sin aviso', async () => {
      const { act } = await render();
      await act('calzado', 'Ocultar');
      expect(commands.setCategoryHidden.mock.calls).toEqual([[T1, { categoryId: 'calzado', hidden: true }]]);
    });

    it('"oculta" y "oculta por su categoría padre" se distinguen', async () => {
      const { rows } = await render(STORE(['camisas', 'hombre']));
      expect(rows().map(([id, , , state]) => [id, state])).toEqual([
        ['ropa', ''],
        ['hombre', 'Oculta'],
        ['camisetas', 'Oculta por su categoría padre (Hombre)'],
        ['camisas', 'Oculta'],
        ['mujer', ''],
        ['calzado', ''],
      ]);
    });

    it('volver a mostrar el padre pide solo eso: la hija oculta por sí misma sigue oculta', async () => {
      const { act, fixture, rows } = await render(STORE(['camisas', 'hombre']));
      await act('hombre', 'Mostrar');
      expect(commands.setCategoryHidden.mock.calls).toEqual([[T1, { categoryId: 'hombre', hidden: false }]]);
      // Llega el árbol actualizado: Camisetas visible, Camisas sigue oculta por sí misma.
      queries.categoryTree.emit(STORE(['camisas']));
      await settle();
      fixture.detectChanges();
      expect(rows().filter(([id]) => id === 'camisetas' || id === 'camisas').map(([id, , , state]) => [id, state])).toEqual([
        ['camisetas', ''],
        ['camisas', 'Oculta'],
      ]);
    });

    it('la acción sigue la visibilidad propia: a una oculta solo por su padre se le ofrece ocultarse', async () => {
      const { row } = await render(STORE(['hombre']));
      row('camisetas').querySelector<HTMLButtonElement>(':scope > .row button.actions')?.click();
      await settle();
      const overlay = TestBed.inject(OverlayContainer).getContainerElement();
      const items = [...overlay.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent?.trim());
      expect(items).toContain('Ocultar');
      expect(items).not.toContain('Mostrar');
    });

    it('se filtra el árbol por visibilidad, con la ruta de cada una', async () => {
      const { type, root } = await render(STORE(['hombre']));
      const listed = () => [...root.querySelectorAll<HTMLElement>('li[data-category]')].map((li) => li.querySelector('.category-path')?.textContent?.trim());
      await type('visibility', 'hidden');
      expect(listed()).toEqual(['Ropa › Hombre', 'Ropa › Hombre › Camisetas', 'Ropa › Hombre › Camisas']);
      await type('visibility', 'visible');
      expect(listed()).toEqual(['Ropa', 'Ropa › Mujer', 'Calzado']);
    });
  });

  // T094 de la 002: lo que cuesta mostrar el árbol no depende de cuántas categorías tiene. Primero las
  // que llenan la pantalla; el resto, por tandas, después de lo ya dibujado y sin correrlo.
  describe('un árbol grande (T094)', () => {
    /** 30 raíces de 2 hijas: 90 categorías, más de las que entran en la primera tanda. */
    const BIG = categoryTree(
      Array.from({ length: 30 }, (_, r) => [
        [`r${r}`, null, `Raíz ${String(r).padStart(2, '0')}`] as [string, string | null, string],
        [`r${r}-a`, `r${r}`, `Raíz ${r} A`] as [string, string | null, string],
        [`r${r}-b`, `r${r}`, `Raíz ${r} B`] as [string, string | null, string],
      ]).flat(),
    );

    it('dibuja primero las 40 primeras, en el orden del árbol, y después el resto a continuación', async () => {
      const fixture = TestBed.createComponent(CategoriesPage);
      fixture.componentRef.setInput('tenantId', 't1');
      await settle();
      queries.categoryTree.emit(BIG);
      // Solo microtareas: las tandas siguientes esperan un turno de temporizador.
      for (let i = 0; i < 5; i++) await Promise.resolve();
      TestBed.tick();
      const root = fixture.nativeElement as HTMLElement;
      const drawn = () => [...root.querySelectorAll<HTMLElement>('li[data-category]')].map((li) => li.dataset['category']);
      expect(drawn()).toHaveLength(40);
      const first = drawn();
      // Una tanda por cuadro pintado.
      for (let i = 0; i < 5 && drawn().length < 90; i++) {
        await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
        await settle();
      }
      expect(drawn()).toHaveLength(90);
      expect(drawn().slice(0, 40)).toEqual(first);
    });
  });

  describe('mover y reordenar (FR-019)', () => {
    it('subir y bajar reordenan entre hermanas, y se anuncia', async () => {
      const { act } = await render();
      await act('camisas', 'Subir');
      expect(commands.moveCategory).toHaveBeenCalledWith(T1, { categoryId: 'camisas', parentId: 'hombre', position: 0 });
      expect(announcer.announce).toHaveBeenCalledWith('«Camisas» quedó en el lugar 1 de «Hombre».');
      await act('ropa', 'Bajar');
      expect(commands.moveCategory).toHaveBeenLastCalledWith(T1, { categoryId: 'ropa', parentId: null, position: 1 });
      expect(announcer.announce).toHaveBeenLastCalledWith('«Ropa» quedó en el lugar 2 del primer nivel.');
    });

    it('la primera no ofrece subir, ni la última bajar', async () => {
      const { row } = await render();
      row('ropa').querySelector<HTMLButtonElement>(':scope > .row button.actions')?.click();
      await settle();
      const overlay = TestBed.inject(OverlayContainer).getContainerElement();
      const items = [...overlay.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent?.trim());
      expect(items).not.toContain('Subir');
      expect(items).toContain('Bajar');
    });

    it('mover a otra con el teclado: solo ofrece destinos válidos (ni su rama, ni su padre, ni más de 3 niveles)', async () => {
      const { act, row, field, type, click } = await render();
      await act('hombre', 'Mover a…');
      // '' es el primer nivel. Mujer no: Hombre arrastra a sus hijas y quedarían en un cuarto nivel.
      const destinations = [...field<HTMLSelectElement>('destination', row('hombre')).options].map((o) => o.value);
      expect(destinations).toEqual(['', 'calzado']);
      await type('destination', 'calzado', row('hombre'));
      await click('Mover', row('hombre'));
      expect(commands.moveCategory).toHaveBeenCalledWith(T1, { categoryId: 'hombre', parentId: 'calzado', position: 0 });
      expect(announcer.announce).toHaveBeenCalledWith('«Hombre» quedó dentro de «Calzado».');
    });

    // T099 de la 002 (WCAG 2.4.3): la fila cambia de lugar, o se crea de nuevo bajo otra madre, recién
    // cuando llega el árbol actualizado; quien usa el teclado no pierde su lugar.
    it('después de subir, el foco vuelve a sus acciones cuando llega el árbol nuevo', async () => {
      const { act, row } = await render();
      await act('camisas', 'Subir');
      queries.categoryTree.emit(moveCategory(STORE(), categoryId('camisas'), categoryId('hombre'), 0));
      await settle();
      expect(document.activeElement).toBe(row('camisas').querySelector(':scope > .row button.actions'));
    });

    it('después de mover a otra, el foco vuelve a sus acciones en el lugar nuevo', async () => {
      const { act, row, type, click } = await render();
      // El árbol nuevo llega antes que la respuesta del comando, como contra el servidor: la fila que
      // pidió el movimiento ya no existe cuando el comando termina.
      let respond: (result: typeof DONE) => void = () => undefined;
      commands.moveCategory.mockImplementationOnce(() => new Promise((resolve) => (respond = resolve)));
      await act('hombre', 'Mover a…');
      await type('destination', 'calzado', row('hombre'));
      await click('Mover', row('hombre'));
      queries.categoryTree.emit(moveCategory(STORE(), categoryId('hombre'), categoryId('calzado'), 0));
      await settle();
      respond(DONE);
      await settle();
      expect(document.activeElement).toBe(row('hombre').querySelector(':scope > .row button.actions'));
    });

    it('si mover falla, el foco no salta después a ninguna parte', async () => {
      const { act, row } = await render();
      commands.moveCategory.mockResolvedValueOnce({ ok: false, code: 'unavailable', message: 'sin red' });
      await act('camisas', 'Subir');
      const actions = row('camisetas').querySelector<HTMLButtonElement>(':scope > .row button.actions');
      actions?.focus();
      // Más tarde llega un árbol donde Camisas sí quedó primera (la movió otra persona).
      queries.categoryTree.emit(moveCategory(STORE(), categoryId('camisas'), categoryId('hombre'), 0));
      await settle();
      expect(document.activeElement).toBe(actions);
    });

    it('arrastrar a otra lista la mueve ahí, en el lugar donde se soltó', async () => {
      const { fixture } = await render();
      const lists = fixture.debugElement.queryAll(By.css('ul[cdkDropList]'));
      const target = lists.find((list) => list.attributes['data-parent'] === 'ropa');
      const drop = { item: { data: 'camisetas' }, container: { data: 'ropa' }, previousContainer: { data: 'hombre' }, currentIndex: 1, previousIndex: 0 };
      target?.triggerEventHandler('cdkDropListDropped', drop as unknown as CdkDragDrop<CategoryId | null, CategoryId | null, CategoryId>);
      await settle();
      expect(commands.moveCategory).toHaveBeenCalledWith(T1, { categoryId: 'camisetas', parentId: 'ropa', position: 1 });
    });

    it('un movimiento rechazado se explica', async () => {
      commands.moveCategory.mockResolvedValue({ ok: false, code: 'category-limit', message: 'x', details: { reason: 'depth' } });
      const { act, row, type, click, text } = await render();
      await act('camisetas', 'Mover a…');
      await type('destination', 'mujer', row('camisetas'));
      await click('Mover', row('camisetas'));
      expect(text()).toContain('Con sus subcategorías quedaría a más de 3 niveles');
    });
  });

  describe('eliminar (FR-024)', () => {
    it('con subcategorías no se ofrece confirmar: lo explica', async () => {
      const { act, row } = await render();
      await act('hombre', 'Eliminar');
      expect(row('hombre').textContent).toContain('Primero mové o eliminá sus subcategorías');
      expect(commands.deleteCategory).not.toHaveBeenCalled();
    });

    it('sin subcategorías, cuenta antes cuántos productos dejan de estar en ella', async () => {
      queries.categoryCounts.set('camisetas', 40);
      const { act, row, click } = await render();
      await act('camisetas', 'Eliminar');
      expect(queries.countInCategory).toHaveBeenCalledWith(T1, 'camisetas');
      expect(row('camisetas').textContent).toContain('40 productos dejarán de estar en «Camisetas»');
      expect(row('camisetas').textContent).toContain('no se modifican de ninguna otra forma');
      await click('Eliminar', row('camisetas'));
      expect(commands.deleteCategory).toHaveBeenCalledWith(T1, { categoryId: 'camisetas' });
    });
  });

  it('sin catalog.write: ve el árbol y filtra, sin crear ni acciones (Historia 2, escenario 10)', async () => {
    useAccess(READ_ONLY_ACCESS);
    const { root, rows, field } = await render(STORE(['hombre']));
    expect(rows()).toHaveLength(6);
    expect(root.querySelector('[data-field="newName"]')).toBeNull();
    expect(root.querySelector('button.actions')).toBeNull();
    expect(root.querySelector('[cdkDragHandle]')).toBeNull();
    expect(field<HTMLSelectElement>('visibility')).toBeTruthy();
  });
});

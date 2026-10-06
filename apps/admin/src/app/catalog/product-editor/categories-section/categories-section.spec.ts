import { TestBed } from '@angular/core/testing';
import { categoryId, type Product } from '@ecommerce/domain';
import { CATALOG_COMMANDS } from '../../../core/client';
import { PendingChanges } from '../../../shared/pending-changes/pending-changes';
import { categoryTree, fakeCatalogCommands, product, provideAccess, READ_ONLY_ACCESS, T1, useAccess } from '../../../../testing/fakes';
import { settle } from '../../../../testing/settle';
import { CategoriesSection } from './categories-section';

const TREE = categoryTree(
  [
    ['ropa', null, 'Ropa'],
    ['hombre', 'ropa', 'Hombre'],
    ['camisetas', 'hombre', 'Camisetas'],
    ['mujer', 'ropa', 'Mujer'],
    ['calzado', null, 'Calzado'],
  ],
  ['mujer'],
);

const ids = (...values: string[]) => values.map(categoryId);

// T060 — Historia 2: las categorías de un producto (FR-022). El editor manda lo que agrega y lo que
// quita, nunca el conjunto completo: así no pisa una asignación masiva hecha al mismo tiempo.
describe('CategoriesSection', () => {
  let commands: ReturnType<typeof fakeCatalogCommands>;

  beforeEach(() => {
    commands = fakeCatalogCommands();
    commands.setProductCategories.mockResolvedValue({ ok: true, data: { categoryIds: [] } });
    TestBed.configureTestingModule({
      imports: [CategoriesSection],
      providers: [provideAccess(), { provide: CATALOG_COMMANDS, useValue: commands }],
    });
  });

  async function render(overrides: Partial<Product> = {}, tree = TREE) {
    const fixture = TestBed.createComponent(CategoriesSection);
    fixture.componentRef.setInput('tenantId', T1);
    fixture.componentRef.setInput('product', product('p1', 'Camiseta', { version: 4, ...overrides }));
    // El árbol lo lee el editor y llega como entrada: la sección no se muestra sin él.
    fixture.componentRef.setInput('tree', tree);
    await settle();
    const root = fixture.nativeElement as HTMLElement;
    const chips = () => [...root.querySelectorAll('.chip-label')].map((chip) => chip.textContent?.trim());
    const text = () => root.textContent?.replace(/\s+/g, ' ') ?? '';
    const button = (label: string) => [...root.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === label);
    const click = async (label: string) => {
      const target = button(label);
      if (!target) throw new Error(`No hay botón «${label}»`);
      target.click();
      await settle();
    };
    const choose = async (id: string) => {
      const select = root.querySelector<HTMLSelectElement>('[data-field="addCategory"]');
      if (!select) throw new Error('No se ofrece agregar');
      select.value = id;
      select.dispatchEvent(new Event('change'));
      await settle();
      await click('Agregar');
    };
    const options = () => [...(root.querySelector<HTMLSelectElement>('[data-field="addCategory"]')?.options ?? [])].map((o) => o.value);
    /** La actualización en tiempo real del producto, como la entrega el editor. */
    const update = async (changes: Partial<Product>) => {
      fixture.componentRef.setInput('product', product('p1', 'Camiseta', { version: 4, ...overrides, ...changes }));
      await settle();
    };
    return { root, chips, text, button, click, choose, options, update };
  }

  it('muestra cada una con su ruta, sin las que ya no existen, y cuántas de 20', async () => {
    const { chips, text } = await render({ categoryIds: ids('camisetas', 'borrada', 'calzado') });
    expect(chips()).toEqual(['Ropa › Hombre › Camisetas', 'Calzado']);
    expect(text()).toContain('2 de 20');
  });

  it('el selector se nombra solo por su etiqueta, sin el texto de sus opciones', async () => {
    const { root } = await render();
    expect(root.querySelector<HTMLSelectElement>('[data-field="addCategory"]')?.labels?.[0]?.textContent?.trim()).toBe('Agregar categoría');
  });

  it('una oculta en la tienda se señala', async () => {
    const { chips } = await render({ categoryIds: ids('mujer') });
    expect(chips()).toEqual(['Ropa › Mujer · oculta']);
  });

  it('manda solo lo que agrega y lo que quita, sin versión', async () => {
    const { click, choose } = await render({ categoryIds: ids('camisetas', 'calzado') });
    await click('Quitar «Calzado»');
    await choose('hombre');
    await click('Guardar categorías');
    expect(commands.setProductCategories).toHaveBeenCalledWith(T1, { productId: 'p1', add: ['hombre'], remove: ['calzado'] });
  });

  it('no ofrece agregar las que ya tiene', async () => {
    const { options } = await render({ categoryIds: ids('camisetas') });
    expect(options()).toEqual(['', 'ropa', 'hombre', 'mujer', 'calzado']);
  });

  it('quitar y volver a agregar la misma no deja nada que guardar', async () => {
    const { click, choose, button } = await render({ categoryIds: ids('calzado') });
    await click('Quitar «Calzado»');
    await choose('calzado');
    expect(button('Guardar categorías')).toBeUndefined();
  });

  // research §2 en el panel: una asignación masiva que llega mientras se edita no se pisa.
  it('lo que asigna otra persona mientras se edita aparece, y al guardar no se manda', async () => {
    const { click, update, chips } = await render({ categoryIds: ids('calzado') });
    await click('Quitar «Calzado»');
    await update({ categoryIds: ids('calzado', 'ropa') });
    expect(chips()).toEqual(['Ropa']);
    await click('Guardar categorías');
    expect(commands.setProductCategories).toHaveBeenCalledWith(T1, { productId: 'p1', add: [], remove: ['calzado'] });
  });

  it('con 20 no ofrece agregar más (FR-022)', async () => {
    const many = Array.from({ length: 21 }, (_, i) => [`c${i}`, null, `Categoría ${i}`] as [string, null, string]);
    const { root, text } = await render({ categoryIds: ids(...many.slice(0, 20).map(([id]) => id)) }, categoryTree(many));
    expect(root.querySelector('[data-field="addCategory"]')).toBeNull();
    expect(text()).toContain('Llegaste al tope de 20 categorías');
  });

  it('si falla, lo dice y conserva lo elegido', async () => {
    commands.setProductCategories.mockResolvedValue({ ok: false, code: 'limit-exceeded', message: 'x' });
    const { click, choose, text, chips } = await render({ categoryIds: ids('calzado') });
    await choose('hombre');
    await click('Guardar categorías');
    expect(text()).toContain('Se supera el tope permitido');
    expect(chips()).toEqual(['Calzado', 'Ropa › Hombre']);
  });

  it('lo elegido sin guardar queda pendiente', async () => {
    const { choose } = await render();
    await choose('hombre');
    expect(TestBed.inject(PendingChanges).any()).toBe(true);
  });

  it('sin catalog.write se leen, sin quitar ni agregar', async () => {
    useAccess(READ_ONLY_ACCESS);
    const { root, chips } = await render({ categoryIds: ids('calzado') });
    expect(chips()).toEqual(['Calzado']);
    expect(root.querySelector('[data-field="addCategory"]')).toBeNull();
    expect(root.querySelector('button')).toBeNull();
  });
});

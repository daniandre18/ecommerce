import { TestBed } from '@angular/core/testing';
import type { Product } from '@ecommerce/domain';
import { CATALOG_COMMANDS } from '../../../core/client';
import { PendingChanges } from '../../../shared/pending-changes/pending-changes';
import { fakeCatalogCommands, product, provideAccess, READ_ONLY_ACCESS, T1, useAccess } from '../../../../testing/fakes';
import { settle } from '../../../../testing/settle';
import { ExternalCatalogsSection } from './external-catalogs-section';

// T092 — Historia 4, FR-031: MPN, género y rango de edad, con la taxonomía guardada y el rango legible.
describe('ExternalCatalogsSection', () => {
  let commands: ReturnType<typeof fakeCatalogCommands>;

  beforeEach(() => {
    commands = fakeCatalogCommands();
    commands.updateProductDetails.mockResolvedValue({ ok: true, data: { version: 6 } });
    TestBed.configureTestingModule({ imports: [ExternalCatalogsSection], providers: [provideAccess(), { provide: CATALOG_COMMANDS, useValue: commands }] });
  });

  async function render(overrides: Partial<Product> = {}) {
    const fixture = TestBed.createComponent(ExternalCatalogsSection);
    fixture.componentRef.setInput('tenantId', T1);
    fixture.componentRef.setInput('product', product('p1', 'Remera', { version: 5, ...overrides }));
    await settle();
    const root = fixture.nativeElement as HTMLElement;
    const field = <T extends HTMLInputElement | HTMLSelectElement>(name: string) => root.querySelector<T>(`[data-field="${name}"]`);
    const set = async (name: string, value: string) => {
      const control = field(name);
      if (!control) throw new Error(`No hay campo ${name}`);
      control.value = value;
      control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input'));
      await settle();
    };
    const options = (name: string) => [...(field<HTMLSelectElement>(name)?.options ?? [])].map((o) => [o.value, o.textContent?.trim()]);
    const button = (label: string) => [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
    const click = async (label: string) => {
      button(label)?.click();
      await settle();
    };
    const text = () => root.textContent?.replace(/\s+/g, ' ') ?? '';
    return { root, field, set, options, button, click, text };
  }

  it('el rango de edad se presenta legible y se guarda con la taxonomía', async () => {
    const { options } = await render();
    expect(options('ageGroup')).toEqual([
      ['', 'Sin rango de edad'],
      ['newborn', '0 a 3 meses'],
      ['infant', '3 a 12 meses'],
      ['toddler', '1 a 5 años'],
      ['kids', '5 a 13 años'],
      ['adult', 'Adulto'],
    ]);
  });

  it('el género, de su lista cerrada', async () => {
    const { options } = await render();
    expect(options('gender')).toEqual([
      ['', 'Sin género'],
      ['male', 'Masculino'],
      ['female', 'Femenino'],
      ['unisex', 'Unisex'],
    ]);
  });

  it('muestra lo guardado', async () => {
    const { field } = await render({ mpn: 'X-100', ageGroup: 'kids', gender: 'female' });
    expect([field('mpn')?.value, field('ageGroup')?.value, field('gender')?.value]).toEqual(['X-100', 'kids', 'female']);
  });

  it('guarda solo lo que cambió, con la versión del producto (escenario 7)', async () => {
    const { set, click } = await render({ mpn: 'X-100' });
    await set('ageGroup', 'adult');
    await set('gender', 'unisex');
    await click('Guardar para catálogos externos');
    expect(commands.updateProductDetails).toHaveBeenCalledWith(T1, { productId: 'p1', version: 5, ageGroup: 'adult', gender: 'unisex' });
  });

  it('elegir "sin" lo quita; vaciar el MPN también', async () => {
    const { set, click } = await render({ mpn: 'X-100', ageGroup: 'kids' });
    await set('ageGroup', '');
    await set('mpn', '');
    await click('Guardar para catálogos externos');
    expect(commands.updateProductDetails).toHaveBeenCalledWith(T1, { productId: 'p1', version: 5, mpn: null, ageGroup: null });
  });

  it('un MPN de más de 70 caracteres no se guarda y lo dice', async () => {
    const { set, button, text } = await render();
    await set('mpn', 'a'.repeat(71));
    expect(text()).toContain('71/70');
    expect(button('Guardar para catálogos externos')?.disabled).toBe(true);
  });

  it('si falla, lo dice y conserva lo elegido', async () => {
    commands.updateProductDetails.mockResolvedValue({ ok: false, code: 'version-conflict', message: 'x' });
    const { set, click, text, field } = await render();
    await set('gender', 'male');
    await click('Guardar para catálogos externos');
    expect(text()).toContain('Alguien más lo editó');
    expect(field('gender')?.value).toBe('male');
  });

  it('sin catalog.write se lee y no se cambia', async () => {
    useAccess(READ_ONLY_ACCESS);
    const { field, button } = await render({ ageGroup: 'adult' });
    expect([field<HTMLInputElement>('mpn')?.readOnly, field('ageGroup')?.disabled, field('gender')?.disabled]).toEqual([true, true, true]);
    expect(button('Guardar para catálogos externos')).toBeUndefined();
  });

  it('lo elegido sin guardar queda pendiente', async () => {
    const { set } = await render();
    await set('gender', 'male');
    expect(TestBed.inject(PendingChanges).any()).toBe(true);
  });
});

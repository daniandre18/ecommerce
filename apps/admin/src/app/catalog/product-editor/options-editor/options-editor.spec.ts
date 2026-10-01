import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import {
  createIncompleteVariant,
  money,
  optionId,
  productId,
  valueId,
  variantId,
  type Product,
  type Variant,
  type VariationOption,
} from '@ecommerce/domain';
import { of } from 'rxjs';
import { CATALOG_COMMANDS } from '../../../core/client';
import { fakeCatalogCommands, product, T1 } from '../../../../testing/fakes';
import { settle } from '../../../../testing/settle';
import { ConfirmDialog } from '../../../shared/confirm-dialog';
import { AssignOptionDialog } from '../../variant-table/assign-option-dialog/assign-option-dialog';
import { OptionsEditor } from './options-editor';

const color: VariationOption = {
  id: optionId('color'),
  name: 'Color',
  position: 0,
  values: [
    { id: valueId('rojo'), label: 'Rojo', position: 0 },
    { id: valueId('azul'), label: 'Azul', position: 1 },
  ],
};

const variantOf = (id: string, colorValue: string | null, data: Partial<Variant> = {}): Variant => ({
  ...createIncompleteVariant({
    id: variantId(id),
    tenantId: T1,
    productId: productId('p1'),
    optionValues: colorValue ? { [color.id]: valueId(colorValue) } : {},
  }),
  version: 1,
  ...data,
});

// T055 — el editor de variaciones: opciones de a una, valores que se agregan, reordenan, renombran y quitan.
describe('OptionsEditor', () => {
  let commands: ReturnType<typeof fakeCatalogCommands>;
  let dialog: { open: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    commands = fakeCatalogCommands();
    commands.setProductOptions.mockResolvedValue({ ok: true, data: { version: 3, created: [], preserved: [], archived: [], discarded: [] } });
    dialog = { open: vi.fn() };
    TestBed.configureTestingModule({
      imports: [OptionsEditor],
      providers: [
        { provide: CATALOG_COMMANDS, useValue: commands },
        { provide: MatDialog, useValue: dialog },
      ],
    });
  });

  async function render(current: Product, variants: Variant[]) {
    const fixture = TestBed.createComponent(OptionsEditor);
    fixture.componentRef.setInput('tenantId', T1);
    fixture.componentRef.setInput('product', current);
    fixture.componentRef.setInput('variants', variants);
    await settle();
    const root = fixture.nativeElement as HTMLElement;
    const button = (name: string) => [...root.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name);
    const click = async (name: string) => {
      const target = button(name);
      if (!target) throw new Error(`No hay botón «${name}»`);
      target.click();
      await settle();
    };
    const inputs = () => [...root.querySelectorAll<HTMLInputElement>('input')];
    const type = async (input: HTMLInputElement | undefined, value: string) => {
      if (!input) throw new Error('No hay campo');
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle();
    };
    const sent = () => commands.setProductOptions.mock.calls.at(-1)?.[1];
    return { root, button, click, inputs, type, sent };
  }

  const labelsSent = (input: { options: VariationOption[] } | undefined) =>
    input?.options.map((o) => [o.name, o.position, o.values.map((v) => [v.label, v.position])]);

  it('muestra las opciones y sus valores en orden', async () => {
    const { inputs } = await render(product('p1', 'Camiseta', { options: [color], version: 2 }), [variantOf('v1', 'rojo'), variantOf('v2', 'azul')]);
    expect(inputs().map((i) => i.value)).toEqual(['Color', 'Rojo', 'Azul']);
  });

  it('agrega una opción de a una, con nombre libre, y la envía con la versión del producto', async () => {
    const { click, inputs, type, sent } = await render(product('p1', 'Taza'), [variantOf('v1', null)]);
    await click('Agregar opción');
    await type(inputs()[0], 'Capacidad');
    await type(inputs()[1], '250 ml');
    await click('Agregar valor a «Capacidad»');
    await type(inputs()[2], '500 ml');
    await click('Guardar opciones');

    expect(sent()).toEqual(expect.objectContaining({ productId: 'p1', version: 1, assignments: [] }));
    expect(labelsSent(sent())).toEqual([['Capacidad', 0, [['250 ml', 0], ['500 ml', 1]]]]);
  });

  it('reordena, renombra y quita valores', async () => {
    const { click, inputs, type, sent } = await render(product('p1', 'Camiseta', { options: [color] }), [variantOf('v1', 'rojo'), variantOf('v2', 'azul')]);
    await click('Bajar «Rojo»');
    await type(inputs()[1], 'Celeste'); // ahora el primero es Azul
    await click('Agregar valor a «Color»');
    await type(inputs()[3], 'Verde');
    await click('Quitar «Verde»');
    await click('Guardar opciones');
    expect(labelsSent(sent())).toEqual([['Color', 0, [['Celeste', 0], ['Rojo', 1]]]]);
  });

  it('no envía una estructura que el dominio rechazaría, y dice por qué', async () => {
    const { root, click, inputs, type } = await render(product('p1', 'Camiseta', { options: [color] }), []);
    await type(inputs()[2], 'rojo');
    await click('Guardar opciones');
    expect(commands.setProductOptions).not.toHaveBeenCalled();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('La opción «Color» repite el valor «rojo»');
  });

  it('a las cinco opciones no ofrece una sexta (FR-025)', async () => {
    const options = Array.from({ length: 5 }, (_, i) => ({ ...color, id: optionId(`o${i}`), name: `O${i}`, position: i, values: [{ id: valueId(`v${i}`), label: 'x', position: 0 }] }));
    const { button } = await render(product('p1', 'Camiseta', { options }), []);
    expect(button('Agregar opción')?.disabled).toBe(true);
  });

  it('avisa en vivo cuántas combinaciones produciría', async () => {
    const { root, click, inputs, type } = await render(product('p1', 'Camiseta', { options: [color] }), []);
    await click('Agregar opción');
    await type(inputs()[3], 'Talla');
    expect(root.textContent).toContain('2 combinaciones');
  });

  // FR-024: al agregar una opción, las variantes con datos piden su valor antes de confirmar.
  it('pide asignar la opción nueva a las variantes con datos, y la envía con esas asignaciones', async () => {
    const withSku = variantOf('v1', 'rojo', { sku: { raw: 'CAM-R', normalized: 'CAM-R' } });
    const empty = variantOf('v2', 'azul');
    const { click, inputs, type, sent } = await render(product('p1', 'Camiseta', { options: [color], version: 4 }), [withSku, empty]);
    await click('Agregar opción');
    await type(inputs()[3], 'Talla');
    await type(inputs()[4], 'S');

    dialog.open.mockImplementation((component, config: { data: { variants: { id: string }[]; options: VariationOption[] } }) => {
      expect(component).toBe(AssignOptionDialog);
      expect(config.data.variants).toEqual([{ id: 'v1', label: 'Rojo' }]);
      const [talla] = config.data.options;
      return { afterClosed: () => of([{ variantId: 'v1', optionId: talla?.id, valueId: talla?.values[0]?.id }]) };
    });
    await click('Guardar opciones');

    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect(sent()?.assignments).toEqual([expect.objectContaining({ variantId: 'v1' })]);
  });

  it('si se cancela la asignación, no envía nada', async () => {
    const withPrice = variantOf('v1', 'rojo', { price: money(1000, 'USD') });
    const { click, inputs, type } = await render(product('p1', 'Camiseta', { options: [color] }), [withPrice]);
    await click('Agregar opción');
    await type(inputs()[3], 'Talla');
    await type(inputs()[4], 'S');
    dialog.open.mockReturnValue({ afterClosed: () => of(undefined) });
    await click('Guardar opciones');
    expect(commands.setProductOptions).not.toHaveBeenCalled();
  });

  // FR-026: quitar un valor en uso archiva sus variantes; con datos, se confirma antes.
  it('quitar un valor usado por una variante con datos pide confirmación', async () => {
    const withStock = variantOf('v1', 'rojo', { stock: { kind: 'quantity', value: 3 } });
    const { click } = await render(product('p1', 'Camiseta', { options: [color] }), [withStock, variantOf('v2', 'azul')]);
    await click('Quitar «Rojo»');
    dialog.open.mockReturnValue({ afterClosed: () => of(false) });
    await click('Guardar opciones');
    expect(dialog.open).toHaveBeenCalledWith(ConfirmDialog, expect.anything());
    expect(commands.setProductOptions).not.toHaveBeenCalled();
  });

  it('si el servidor rechaza, lo dice y conserva el borrador (FR-039)', async () => {
    commands.setProductOptions.mockResolvedValue({ ok: false, code: 'version-conflict', message: 'cambió' });
    const { root, click, inputs, type } = await render(product('p1', 'Camiseta', { options: [color] }), []);
    await type(inputs()[1], 'Bordó');
    await click('Guardar opciones');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Alguien más');
    expect(inputs()[1]?.value).toBe('Bordó');
  });

  it('descartar vuelve a lo guardado', async () => {
    const { click, inputs, type } = await render(product('p1', 'Camiseta', { options: [color] }), []);
    await type(inputs()[1], 'Bordó');
    await click('Descartar cambios');
    expect(inputs()[1]?.value).toBe('Rojo');
  });
});

import { LiveAnnouncer } from '@angular/cdk/a11y';
import { TestBed } from '@angular/core/testing';
import {
  createIncompleteVariant,
  money,
  optionId,
  productId,
  valueId,
  variantId,
  type CurrencyCode,
  type Variant,
  type VariationOption,
} from '@ecommerce/domain';
import { CATALOG_COMMANDS, CATALOG_QUERIES } from '../../../core/client';
import { fakeCatalogCommands, FakeCatalogQueries, product, provideAccess, T1 } from '../../../../testing/fakes';
import { settle } from '../../../../testing/settle';
import { VariantTable } from '../variant-table';

const color: VariationOption = {
  id: optionId('color'),
  name: 'Color',
  position: 0,
  values: ['Rojo', 'Azul', 'Verde'].map((label, position) => ({ id: valueId(label.toLowerCase()), label, position })),
};

const variantOf = (id: string, value: string, version = 1): Variant => ({
  ...createIncompleteVariant({ id: variantId(id), tenantId: T1, productId: productId('p1'), optionValues: { [color.id]: valueId(value) } }),
  version,
});

const ok = { ok: true as const, data: { batchId: 'b1', updated: 2, auditEntryIds: ['e1', 'e2'] } };

// T058 — FR-028: el mismo importe o la misma cantidad a varias variantes, en una acción.
describe('edición masiva', () => {
  let commands: ReturnType<typeof fakeCatalogCommands>;
  const announcer = { announce: vi.fn(async () => undefined) };

  beforeEach(() => {
    commands = fakeCatalogCommands();
    commands.setVariantPrice.mockResolvedValue(ok);
    commands.setVariantStock.mockResolvedValue(ok);
    announcer.announce.mockClear();
    TestBed.configureTestingModule({
      imports: [VariantTable],
      providers: [
        provideAccess(),
        { provide: CATALOG_QUERIES, useValue: new FakeCatalogQueries() },
        { provide: CATALOG_COMMANDS, useValue: commands },
        { provide: LiveAnnouncer, useValue: announcer },
      ],
    });
  });

  async function render(variants: Variant[] = [variantOf('v1', 'rojo', 2), variantOf('v2', 'azul', 5), variantOf('v3', 'verde')]) {
    const fixture = TestBed.createComponent(VariantTable);
    fixture.componentRef.setInput('tenantId', T1);
    fixture.componentRef.setInput('product', product('p1', 'Camiseta', { options: [color] }));
    fixture.componentRef.setInput('variants', variants);
    fixture.componentRef.setInput('currency', 'USD' as CurrencyCode);
    await settle();
    const root = fixture.nativeElement as HTMLElement;
    const checkbox = (name: string) => {
      const input = root.querySelector<HTMLInputElement>(`input[type="checkbox"][aria-label="${name}"]`);
      if (!input) throw new Error(`No hay casilla «${name}»`);
      return input;
    };
    const toggle = async (name: string) => {
      checkbox(name).click();
      await settle();
    };
    const bar = () => root.querySelector<HTMLElement>('app-bulk-edit');
    const apply = async (field: string, value: string) => {
      const panel = bar();
      if (!panel) throw new Error('No hay barra de edición masiva');
      const select = panel.querySelector('select');
      const input = panel.querySelector('input');
      if (!select || !input) throw new Error('Falta un control de la barra');
      select.value = field;
      select.dispatchEvent(new Event('input'));
      select.dispatchEvent(new Event('change'));
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle();
      panel.querySelector('form')?.dispatchEvent(new Event('submit'));
      await settle();
    };
    return { root, fixture, checkbox, toggle, bar, apply };
  }

  it('sin selección no hay barra; con selección dice cuántas hay', async () => {
    const { toggle, bar } = await render();
    expect(bar()).toBeNull();
    await toggle('Seleccionar Rojo');
    await toggle('Seleccionar Verde');
    expect(bar()?.textContent).toContain('2 variantes seleccionadas');
  });

  it('"seleccionar todas" marca todas, y otra vez las desmarca', async () => {
    const { toggle, checkbox, bar } = await render();
    await toggle('Seleccionar todas las variantes');
    expect(['Rojo', 'Azul', 'Verde'].map((label) => checkbox(`Seleccionar ${label}`).checked)).toEqual([true, true, true]);
    await toggle('Seleccionar todas las variantes');
    expect(bar()).toBeNull();
  });

  it('aplica el mismo precio a las seleccionadas, en una sola orden y con la versión de cada una', async () => {
    const { toggle, apply } = await render();
    await toggle('Seleccionar Rojo');
    await toggle('Seleccionar Azul');
    await apply('price', '20');
    expect(commands.setVariantPrice).toHaveBeenCalledTimes(1);
    expect(commands.setVariantPrice).toHaveBeenCalledWith(T1, {
      productId: 'p1',
      changes: [
        { variantId: 'v1', version: 2, price: money(2000, 'USD') },
        { variantId: 'v2', version: 5, price: money(2000, 'USD') },
      ],
    });
    expect(announcer.announce).toHaveBeenCalledWith('Precio aplicado a 2 variantes');
  });

  it('existencias vacías dejan todas "sin definir", no en cero', async () => {
    const { toggle, apply } = await render();
    await toggle('Seleccionar todas las variantes');
    await apply('stock', '');
    expect(commands.setVariantStock).toHaveBeenCalledWith(T1, {
      productId: 'p1',
      changes: ['v1', 'v2', 'v3'].map((id, i) => ({ variantId: id, version: [2, 5, 1][i], stock: { kind: 'undefined' } })),
    });
  });

  it('un precio vacío no se aplica: el precio no se puede quitar', async () => {
    const { root, toggle, apply } = await render();
    await toggle('Seleccionar Rojo');
    await apply('price', '');
    expect(commands.setVariantPrice).not.toHaveBeenCalled();
    expect(root.textContent).toContain('Escribí el precio');
  });

  // FR-030: el lote se aplica entero o no se aplica.
  it('si alguna cambió mientras tanto, dice que no se aplicó a ninguna', async () => {
    commands.setVariantPrice.mockResolvedValue({ ok: false, code: 'version-conflict', message: 'cambió' });
    const { root, toggle, apply } = await render();
    await toggle('Seleccionar Rojo');
    await apply('price', '20');
    expect(root.querySelector('app-bulk-edit [role="alert"]')?.textContent).toContain('No se aplicó a ninguna');
  });

  it('una variante que deja de estar en la tabla deja de estar seleccionada', async () => {
    const { fixture, toggle, bar } = await render();
    await toggle('Seleccionar Rojo');
    await toggle('Seleccionar Azul');
    fixture.componentRef.setInput('variants', [variantOf('v2', 'azul', 5), variantOf('v3', 'verde')]);
    await settle();
    expect(bar()?.textContent).toContain('1 variante seleccionada');
  });
});

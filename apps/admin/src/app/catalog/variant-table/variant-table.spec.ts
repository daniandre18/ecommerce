import { LiveAnnouncer } from '@angular/cdk/a11y';
import { TestBed } from '@angular/core/testing';
import {
  createIncompleteVariant,
  money,
  optionId,
  productId,
  stockQuantity,
  valueId,
  variantId,
  type CurrencyCode,
  type Product,
  type Variant,
  type VariationOption,
} from '@ecommerce/domain';
import { CATALOG_COMMANDS } from '../../core/client';
import { fakeCatalogCommands, product, T1 } from '../../../testing/fakes';
import { settle } from '../../../testing/settle';
import { VariantTable } from './variant-table';

const color: VariationOption = {
  id: optionId('color'),
  name: 'Color',
  position: 0,
  values: [
    { id: valueId('rojo'), label: 'Rojo', position: 0 },
    { id: valueId('azul'), label: 'Azul', position: 1 },
  ],
};

const variantOf = (id: string, value: string, data: Partial<Variant> = {}): Variant => ({
  ...createIncompleteVariant({ id: variantId(id), tenantId: T1, productId: productId('p1'), optionValues: { [color.id]: valueId(value) } }),
  version: 3,
  ...data,
});

// T056 — una fila por combinación, editable en línea (FR-018, FR-028), con anuncio accesible (FR-038a).
describe('VariantTable', () => {
  let commands: ReturnType<typeof fakeCatalogCommands>;
  const announcer = { announce: vi.fn(async () => undefined) };

  beforeEach(() => {
    commands = fakeCatalogCommands();
    commands.setVariantSku.mockResolvedValue({ ok: true, data: { version: 4, complete: true } });
    commands.setVariantPrice.mockResolvedValue({ ok: true, data: { batchId: 'b', updated: 1, auditEntryIds: ['e'] } });
    commands.setVariantStock.mockResolvedValue({ ok: true, data: { batchId: 'b', updated: 1, auditEntryIds: ['e'] } });
    announcer.announce.mockClear();
    TestBed.configureTestingModule({
      imports: [VariantTable],
      providers: [
        { provide: CATALOG_COMMANDS, useValue: commands },
        { provide: LiveAnnouncer, useValue: announcer },
      ],
    });
  });

  async function render(variants: Variant[], current: Product = product('p1', 'Camiseta', { options: [color] })) {
    const fixture = TestBed.createComponent(VariantTable);
    fixture.componentRef.setInput('tenantId', T1);
    fixture.componentRef.setInput('product', current);
    fixture.componentRef.setInput('variants', variants);
    fixture.componentRef.setInput('currency', 'USD' as CurrencyCode);
    await settle();
    const root = fixture.nativeElement as HTMLElement;
    const row = (label: string) => {
      const group = [...root.querySelectorAll<HTMLElement>('[role="group"]')].find((g) => g.querySelector('.label')?.textContent?.includes(label));
      if (!group) throw new Error(`No hay fila «${label}»`);
      const field = (name: string) => {
        const input = [...group.querySelectorAll('mat-form-field')].find((f) => f.querySelector('mat-label')?.textContent?.trim().startsWith(name))?.querySelector('input');
        if (!input) throw new Error(`No hay campo ${name} en «${label}»`);
        return input;
      };
      const edit = async (name: string, value: string) => {
        const input = field(name);
        input.value = value;
        input.dispatchEvent(new Event('input'));
        input.dispatchEvent(new Event('blur'));
        await settle();
      };
      return { group, field, edit };
    };
    return { root, fixture, row };
  }

  it('una fila por variante, en el orden de los valores, con lo guardado', async () => {
    const { root, row } = await render([
      variantOf('v2', 'azul'),
      variantOf('v1', 'rojo', { sku: { raw: 'CAM-R', normalized: 'CAM-R' }, price: money(12990, 'USD'), stock: stockQuantity(0) }),
    ]);
    expect([...root.querySelectorAll('.label')].map((l) => l.textContent?.trim().split(/\s+/)[0])).toEqual(['Rojo', 'Azul']);
    expect(row('Rojo').field('SKU').value).toBe('CAM-R');
    expect(row('Rojo').field('Precio').value).toBe('129,90');
    expect(row('Rojo').field('Existencias').value).toBe('0');
  });

  // FR-029: sin definir no es cero, tampoco en la pantalla.
  it('las existencias sin definir se ven como "Sin definir", no como cero', async () => {
    const { row } = await render([variantOf('v1', 'rojo')]);
    expect(row('Rojo').field('Existencias').value).toBe('');
    expect(row('Rojo').field('Existencias').placeholder).toBe('Sin definir');
    expect(row('Rojo').group.textContent).toContain('Falta el SKU');
  });

  it('el SKU se guarda al salir del campo, con la versión de la variante, y se anuncia', async () => {
    const { row } = await render([variantOf('v1', 'rojo')]);
    await row('Rojo').edit('SKU', 'cam-r');
    expect(commands.setVariantSku).toHaveBeenCalledWith(T1, { productId: 'p1', variantId: 'v1', version: 3, sku: 'cam-r' });
    expect(announcer.announce).toHaveBeenCalledWith('SKU de Rojo guardado');
  });

  it('salir de un campo sin cambios no envía nada', async () => {
    const { row } = await render([variantOf('v1', 'rojo', { sku: { raw: 'A', normalized: 'A' } })]);
    await row('Rojo').edit('SKU', 'A');
    expect(commands.setVariantSku).not.toHaveBeenCalled();
  });

  // FR-021: el rechazo señala qué variante ocupa el código.
  it('un SKU ocupado dice qué variante lo usa', async () => {
    commands.setVariantSku.mockResolvedValue({ ok: false, code: 'sku-conflict', message: 'ocupado', details: { occupiedBy: 'v2', productId: 'p1' } });
    const { row } = await render([variantOf('v1', 'rojo'), variantOf('v2', 'azul', { sku: { raw: 'X', normalized: 'X' } })]);
    await row('Rojo').edit('SKU', 'x');
    expect(row('Rojo').group.textContent).toContain('Ese SKU ya lo usa la variante Azul');
    expect(row('Rojo').field('SKU').value).toBe('x');
  });

  it('el precio escrito con coma se envía en centavos', async () => {
    const { row } = await render([variantOf('v1', 'rojo')]);
    await row('Rojo').edit('Precio', '129,9');
    expect(commands.setVariantPrice).toHaveBeenCalledWith(T1, { productId: 'p1', changes: [{ variantId: 'v1', version: 3, price: money(12990, 'USD') }] });
  });

  // Lo guardado deja de ser "escrito sin guardar": toma la forma canónica y vuelve a seguir al servidor.
  it('después de guardar, el campo muestra el importe como lo guarda el servidor y sigue sus cambios', async () => {
    const { fixture, row } = await render([variantOf('v1', 'rojo')]);
    await row('Rojo').edit('Precio', '10');
    expect(row('Rojo').field('Precio').value).toBe('10,00');

    fixture.componentRef.setInput('variants', [variantOf('v1', 'rojo', { price: money(1000, 'USD'), version: 4 })]);
    await settle();
    fixture.componentRef.setInput('variants', [variantOf('v1', 'rojo', { price: money(1500, 'USD'), version: 5 })]);
    await settle();
    expect(row('Rojo').field('Precio').value).toBe('15,00');
  });

  it('un precio mal escrito no se envía y se explica', async () => {
    const { row } = await render([variantOf('v1', 'rojo')]);
    await row('Rojo').edit('Precio', '12,345');
    expect(commands.setVariantPrice).not.toHaveBeenCalled();
    expect(row('Rojo').group.textContent).toContain('Usá hasta 2 decimales');
  });

  it('vaciar el precio tachado lo quita', async () => {
    const { row } = await render([variantOf('v1', 'rojo', { compareAtPrice: money(20000, 'USD') })]);
    await row('Rojo').edit('Precio tachado', '');
    expect(commands.setVariantPrice).toHaveBeenCalledWith(T1, { productId: 'p1', changes: [{ variantId: 'v1', version: 3, compareAtPrice: null }] });
  });

  it('vaciar las existencias las deja "sin definir", no en cero', async () => {
    const { row } = await render([variantOf('v1', 'rojo', { stock: stockQuantity(3) })]);
    await row('Rojo').edit('Existencias', '');
    expect(commands.setVariantStock).toHaveBeenCalledWith(T1, { productId: 'p1', changes: [{ variantId: 'v1', version: 3, stock: { kind: 'undefined' } }] });
  });

  it('dos cambios seguidos en la misma fila usan la versión que dejó el anterior', async () => {
    const { row } = await render([variantOf('v1', 'rojo')]);
    await row('Rojo').edit('SKU', 'A');
    await row('Rojo').edit('Existencias', '5');
    expect(commands.setVariantStock).toHaveBeenCalledWith(T1, expect.objectContaining({ changes: [expect.objectContaining({ version: 4 })] }));
  });

  // FR-027 y FR-039: nunca sobrescribe en silencio, y lo escrito no se pierde.
  it('si cambió mientras se editaba, lo dice y conserva lo escrito', async () => {
    commands.setVariantPrice.mockResolvedValue({ ok: false, code: 'version-conflict', message: 'cambió' });
    const { row } = await render([variantOf('v1', 'rojo', { price: money(1000, 'USD') })]);
    await row('Rojo').edit('Precio', '15');
    expect(row('Rojo').group.textContent).toContain('Cambió mientras la editabas');
    expect(row('Rojo').field('Precio').value).toBe('15');
  });

  it('un cambio que llega del servidor no pisa lo que se está escribiendo en otro campo', async () => {
    const { fixture, row } = await render([variantOf('v1', 'rojo')]);
    const input = row('Rojo').field('Precio');
    input.value = '99';
    input.dispatchEvent(new Event('input'));
    await settle();
    fixture.componentRef.setInput('variants', [variantOf('v1', 'rojo', { stock: stockQuantity(7), version: 4 })]);
    await settle();
    expect(row('Rojo').field('Precio').value).toBe('99');
    expect(row('Rojo').field('Existencias').value).toBe('7');
  });
});

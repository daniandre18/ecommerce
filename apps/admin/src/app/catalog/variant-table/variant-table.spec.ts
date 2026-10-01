import { LiveAnnouncer } from '@angular/cdk/a11y';
import { signal } from '@angular/core';
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
  type MemberAccess,
  type Product,
  type Variant,
  type VariationOption,
} from '@ecommerce/domain';
import { CATALOG_COMMANDS, CATALOG_QUERIES } from '../../core/client';
import { PendingChanges } from '../../shared/pending-changes/pending-changes';
import { CURRENT_ACCESS } from '../../tenant/current-access';
import { CATALOG_ACCESS, fakeCatalogCommands, FakeCatalogQueries, OWNER_ACCESS, product, T1 } from '../../../testing/fakes';
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
  let queries: FakeCatalogQueries;
  const access = signal<MemberAccess | null | undefined>(OWNER_ACCESS);
  const announcer = { announce: vi.fn(async () => undefined) };

  beforeEach(() => {
    commands = fakeCatalogCommands();
    commands.setVariantSku.mockResolvedValue({ ok: true, data: { version: 4, complete: true } });
    commands.setVariantPrice.mockResolvedValue({ ok: true, data: { batchId: 'b', updated: 1, auditEntryIds: ['e'] } });
    commands.setVariantStock.mockResolvedValue({ ok: true, data: { batchId: 'b', updated: 1, auditEntryIds: ['e'] } });
    commands.setVariantCost.mockResolvedValue({ ok: true, data: { batchId: 'b', updated: 1, auditEntryIds: ['e'] } });
    queries = new FakeCatalogQueries();
    access.set(OWNER_ACCESS);
    announcer.announce.mockClear();
    TestBed.configureTestingModule({
      imports: [VariantTable],
      providers: [
        { provide: CURRENT_ACCESS, useValue: access },
        { provide: CATALOG_QUERIES, useValue: queries },
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

  // FR-038a: con Enter el campo no pierde el foco; el error igual se muestra y se anuncia.
  it('con Enter, un valor mal escrito se marca y se anuncia sin salir del campo', async () => {
    const { row } = await render([variantOf('v1', 'rojo')]);
    const price = row('Rojo').field('Precio');
    price.value = 'abc';
    price.dispatchEvent(new Event('input'));
    price.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    expect(commands.setVariantPrice).not.toHaveBeenCalled();
    expect(price.getAttribute('aria-invalid')).toBe('true');
    expect(announcer.announce).toHaveBeenCalledWith(expect.stringMatching(/^Precio de Rojo: /), 'assertive');
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

  describe('según el rol (T078, T079)', () => {
    const labels = (group: HTMLElement) => [...group.querySelectorAll('mat-label')].map((label) => label.textContent?.trim());

    it('el Propietario ve el costo de cada variante, pedido aparte', async () => {
      const { row } = await render([variantOf('v1', 'rojo'), variantOf('v2', 'azul')]);
      expect(queries.costLists.map((s) => s.params)).toEqual([{ tenantId: T1, productId: 'p1' }]);
      expect(row('Rojo').field('Costo').placeholder).toBe('Cargando…');
      expect(row('Rojo').field('Costo').readOnly).toBe(true);

      queries.costLists[0]?.emit(new Map([[variantId('v1'), money(800, 'USD')]]));
      await settle();
      expect(row('Rojo').field('Costo').value).toBe('8,00');
      expect(row('Azul').field('Costo').value).toBe('');
      expect(row('Azul').field('Costo').placeholder).toBe('Sin costo');
    });

    it('el costo se guarda con su propia orden, sin versión: vive en otro documento', async () => {
      const { row } = await render([variantOf('v1', 'rojo')]);
      queries.costLists[0]?.emit(new Map());
      await settle();
      await row('Rojo').edit('Costo', '8');
      expect(commands.setVariantCost).toHaveBeenCalledWith(T1, { productId: 'p1', changes: [{ variantId: 'v1', cost: money(800, 'USD') }] });
      expect(announcer.announce).toHaveBeenCalledWith('Costo de Rojo guardado');

      await row('Rojo').edit('SKU', 'A');
      expect(commands.setVariantSku).toHaveBeenCalledWith(T1, expect.objectContaining({ version: 3 }));
    });

    // FR-015: sin variant.cost.read, la columna no existe y el documento ni se pide.
    it('el rol de Catálogo no ve el costo ni lo pide, y ve los precios sin poder cambiarlos', async () => {
      access.set(CATALOG_ACCESS);
      const { row } = await render([variantOf('v1', 'rojo', { price: money(12990, 'USD') })]);
      expect(queries.costLists).toEqual([]);
      expect(labels(row('Rojo').group)).not.toContain('Costo (USD)');

      expect(row('Rojo').field('Precio').value).toBe('129,90');
      expect(row('Rojo').field('Precio').readOnly).toBe(true);
      expect(row('Rojo').field('Precio tachado').readOnly).toBe(true);
      expect(row('Rojo').field('SKU').readOnly).toBe(false);
      expect(row('Rojo').field('Existencias').readOnly).toBe(false);
    });

    it('leer el costo sin poder cambiarlo lo muestra fijo', async () => {
      access.set({ isOwner: false, permissions: ['catalog.read', 'variant.cost.read'] });
      const { row } = await render([variantOf('v1', 'rojo')]);
      queries.costLists[0]?.emit(new Map([[variantId('v1'), money(800, 'USD')]]));
      await settle();
      expect(row('Rojo').field('Costo').value).toBe('8,00');
      expect(row('Rojo').field('Costo').readOnly).toBe(true);
    });

    it('la edición masiva ofrece solo los campos que el rol puede cambiar', async () => {
      access.set(CATALOG_ACCESS);
      const { root, fixture } = await render([variantOf('v1', 'rojo'), variantOf('v2', 'azul')]);
      root.querySelector<HTMLInputElement>('input[aria-label="Seleccionar todas las variantes"]')?.click();
      fixture.detectChanges();
      await settle();
      const options = [...root.querySelectorAll('app-bulk-edit option')].map((o) => o.textContent?.trim());
      expect(options).toEqual(['Existencias']);
    });

    it('sin permiso para precios ni existencias no hay selección ni edición masiva', async () => {
      access.set({ isOwner: false, permissions: ['catalog.read'] });
      const { root, row } = await render([variantOf('v1', 'rojo'), variantOf('v2', 'azul')]);
      expect(root.querySelector('mat-checkbox')).toBeNull();
      expect(row('Rojo').field('SKU').readOnly).toBe(true);
    });

    it('si el rol gana el permiso de costo, la columna aparece sin recargar', async () => {
      access.set(CATALOG_ACCESS);
      const { row } = await render([variantOf('v1', 'rojo')]);
      expect(queries.costLists).toEqual([]);

      access.set({ ...CATALOG_ACCESS, permissions: [...CATALOG_ACCESS.permissions, 'variant.cost.read'] });
      await settle();
      expect(queries.costLists).toHaveLength(1);
      expect(labels(row('Rojo').group)).toContain('Costo (USD)');
    });
  });

  // T094 — FR-039: lo rechazado queda escrito y pendiente; lo aceptado, no.
  describe('trabajo en curso', () => {
    const pending = () => TestBed.inject(PendingChanges).any();

    it('un guardado rechazado conserva lo escrito y lo deja pendiente hasta que se guarde', async () => {
      commands.setVariantPrice.mockResolvedValue({ ok: false, code: 'unavailable', message: 'sin red' });
      const { row } = await render([variantOf('v1', 'rojo')]);
      expect(pending()).toBe(false);
      await row('Rojo').edit('Precio', '15');
      expect(row('Rojo').field('Precio').value).toBe('15');
      expect(row('Rojo').group.textContent).toContain('No hay conexión con el servidor');
      expect(pending()).toBe(true);

      expect(row('Rojo').field('Precio').getAttribute('aria-invalid')).toBe('true');

      commands.setVariantPrice.mockResolvedValue({ ok: true, data: { batchId: 'b', updated: 1, auditEntryIds: ['e'] } });
      row('Rojo').field('Precio').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await settle();
      expect(commands.setVariantPrice).toHaveBeenCalledTimes(2);
      expect(pending()).toBe(false);
    });

    it('un rechazo por el valor mismo, como un SKU ocupado, no se reenvía igual: hay que cambiarlo', async () => {
      commands.setVariantSku.mockResolvedValue({ ok: false, code: 'sku-conflict', message: 'ocupado', details: { occupiedBy: 'v2', productId: 'p1' } });
      const { row } = await render([variantOf('v1', 'rojo'), variantOf('v2', 'azul', { sku: { raw: 'X', normalized: 'X' } })]);
      await row('Rojo').edit('SKU', 'x');
      row('Rojo').field('SKU').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await settle();
      expect(commands.setVariantSku).toHaveBeenCalledTimes(1);
      expect(pending()).toBe(true);
    });
  });
});

import { TestBed } from '@angular/core/testing';
import type { Product } from '@ecommerce/domain';
import { CATALOG_COMMANDS } from '../../../core/client';
import { PendingChanges } from '../../../shared/pending-changes/pending-changes';
import { fakeCatalogCommands, product, provideAccess, READ_ONLY_ACCESS, T1, useAccess } from '../../../../testing/fakes';
import { settle } from '../../../../testing/settle';
import { ShippingSection } from './shipping-section';

const BOX = { length: 300, width: 200, height: 20 };

// T039 — Historia 1: tipo y envío (FR-013 a FR-017), con el aviso de lo que cambia para el comprador.
describe('ShippingSection', () => {
  let commands: ReturnType<typeof fakeCatalogCommands>;

  beforeEach(() => {
    commands = fakeCatalogCommands();
    commands.setProductShipping.mockResolvedValue({ ok: true, data: { version: 3 } });
    commands.setProductType.mockResolvedValue({ ok: true, data: { version: 3, changes: [] } });
    TestBed.configureTestingModule({ imports: [ShippingSection], providers: [provideAccess(), { provide: CATALOG_COMMANDS, useValue: commands }] });
  });

  async function render(overrides: Partial<Product> = {}) {
    const fixture = TestBed.createComponent(ShippingSection);
    fixture.componentRef.setInput('tenantId', T1);
    fixture.componentRef.setInput('product', product('p1', 'Camiseta', { version: 2, ...overrides }));
    await settle();
    const root = fixture.nativeElement as HTMLElement;
    const field = (name: string) => root.querySelector<HTMLInputElement>(`[data-field="${name}"]`);
    const type = async (name: string, value: string) => {
      const input = field(name);
      if (!input) throw new Error(`No hay campo ${name}`);
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle();
    };
    const choose = async (kind: 'physical' | 'digital') => {
      const radio = root.querySelector<HTMLInputElement>(`input[type="radio"][value="${kind}"]`);
      if (!radio) throw new Error(`No hay opción ${kind}`);
      radio.click();
      await settle();
    };
    const button = (label: string) => [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
    const click = async (label: string) => {
      const target = button(label);
      if (!target) throw new Error(`No hay botón "${label}"`);
      target.click();
      await settle();
    };
    const text = () => root.textContent?.replace(/\s+/g, ' ') ?? '';
    /** La actualización en tiempo real del producto, como la entrega el panel. */
    const update = async (changes: Partial<Product>) => {
      fixture.componentRef.setInput('product', product('p1', 'Camiseta', { version: 2, ...overrides, ...changes }));
      await settle();
    };
    return { root, field, type, choose, button, click, text, update };
  }

  describe('peso y dimensiones (FR-014)', () => {
    it('se muestran en kg y cm, guardados en gramos y milímetros', async () => {
      const { field } = await render({ weightGrams: 450, dimensionsMm: BOX });
      expect([field('weight')?.value, field('length')?.value, field('width')?.value, field('height')?.value]).toEqual(['0.45', '30', '20', '2']);
    });

    it('se guardan convertidos a gramos y milímetros enteros, con la versión del producto', async () => {
      const { type, click } = await render();
      await type('weight', '0.45');
      await type('length', '30');
      await type('width', '20');
      await type('height', '2.5');
      await click('Guardar envío');
      expect(commands.setProductShipping).toHaveBeenCalledWith(T1, {
        productId: 'p1',
        version: 2,
        weightGrams: 450,
        dimensionsMm: { length: 300, width: 200, height: 25 },
      });
    });

    it('con las dimensiones a medias no guarda y lo dice', async () => {
      const { type, click, text } = await render();
      await type('length', '30');
      await click('Guardar envío');
      expect(commands.setProductShipping).not.toHaveBeenCalled();
      expect(text()).toContain('Completá largo, ancho y alto');
    });

    it('un peso de cero no se guarda', async () => {
      const { type, click, text } = await render();
      await type('weight', '0');
      await click('Guardar envío');
      expect(commands.setProductShipping).not.toHaveBeenCalled();
      expect(text()).toContain('mayor que cero');
    });

    it('un físico sin peso lo señala, sin impedir nada (FR-017)', async () => {
      const { text } = await render({ missingShippingData: true });
      expect(text()).toContain('Faltan datos de envío');
    });

    it('un digital no pide peso ni dimensiones, y dice por qué', async () => {
      const { field, text } = await render({ kind: 'digital' });
      expect(field('weight')).toBeNull();
      expect(text()).toContain('Un producto digital no se envía');
    });
  });

  describe('cambiar el tipo (FR-016)', () => {
    it('antes de confirmar, avisa qué cambia para el comprador y qué datos dejan de usarse', async () => {
      const { choose, text } = await render({ weightGrams: 450, dimensionsMm: BOX });
      await choose('digital');
      expect(text()).toContain('El comprador dejará de pagar envío');
      expect(text()).toContain('El peso, las dimensiones y el envío gratis se conservan, pero dejan de usarse');
      expect(commands.setProductType).not.toHaveBeenCalled();
    });

    it('confirmar lo cambia con la versión del producto', async () => {
      const { choose, click } = await render();
      await choose('digital');
      await click('Confirmar el cambio');
      expect(commands.setProductType).toHaveBeenCalledWith(T1, { productId: 'p1', version: 2, kind: 'digital' });
    });

    it('cancelar deja todo como estaba', async () => {
      const { choose, click, root } = await render();
      await choose('digital');
      await click('Cancelar');
      expect(commands.setProductType).not.toHaveBeenCalled();
      expect(root.querySelector<HTMLInputElement>('input[type="radio"][value="physical"]')?.checked).toBe(true);
    });

    // Hallado por la e2e (T043): mientras el cambio viaja al servidor, el producto todavía tiene el
    // tipo anterior. Elegir otro en ese intervalo partiría de un estado que no es el definitivo: los
    // tipos se deshabilitan hasta la respuesta, y después se puede volver a elegir.
    it('mientras se confirma un cambio de tipo, no se puede elegir otro; después sí', async () => {
      let answer: (value: unknown) => void = () => undefined;
      commands.setProductType.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      const { root, choose, click, text, update } = await render();
      const radio = (kind: string) => root.querySelector<HTMLInputElement>(`input[type="radio"][value="${kind}"]`);
      await choose('digital');
      await click('Confirmar el cambio');
      expect(text()).not.toContain('Antes de cambiarlo');
      expect([radio('physical')?.disabled, radio('digital')?.checked]).toEqual([true, true]);

      await update({ kind: 'digital', version: 3 });
      answer({ ok: true, data: { version: 3, changes: [] } });
      await settle();
      expect(radio('physical')?.disabled).toBe(false);
      await choose('physical');
      expect(text()).toContain('Antes de cambiarlo a físico');
    });

    it('un digital que pasa a físico: el comprador pasa a pagar envío', async () => {
      const { choose, text } = await render({ kind: 'digital' });
      await choose('physical');
      expect(text()).toContain('El comprador pasará a pagar envío');
    });

    it('un físico con envío gratis que pasa a digital: el comprador ya no tendrá envío gratis', async () => {
      const { choose, text } = await render({ freeShipping: true });
      await choose('digital');
      expect(text()).toContain('ya no tendrá envío gratis');
    });
  });

  it('sin permiso para escribir el catálogo, se lee pero no se cambia', async () => {
    useAccess(READ_ONLY_ACCESS);
    const { field, root, button } = await render({ weightGrams: 450 });
    expect(field('weight')?.readOnly).toBe(true);
    expect(root.querySelector<HTMLInputElement>('input[type="radio"][value="digital"]')?.disabled).toBe(true);
    expect(button('Guardar envío')).toBeUndefined();
  });

  it('lo escrito sin guardar queda pendiente', async () => {
    const { type } = await render();
    await type('weight', '1');
    expect(TestBed.inject(PendingChanges).any()).toBe(true);
  });
});

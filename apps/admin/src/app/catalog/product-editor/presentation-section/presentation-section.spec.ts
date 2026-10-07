import { TestBed } from '@angular/core/testing';
import { emptySections, productId, type FeaturedSections, type MemberAccess, type Product } from '@ecommerce/domain';
import { CATALOG_COMMANDS } from '../../../core/client';
import { PendingChanges } from '../../../shared/pending-changes/pending-changes';
import { CATALOG_ACCESS, fakeCatalogCommands, product, provideAccess, READ_ONLY_ACCESS, T1, useAccess } from '../../../../testing/fakes';
import { settle } from '../../../../testing/settle';
import { PresentationSection } from './presentation-section';

const PRICE_ONLY: MemberAccess = { isOwner: false, permissions: ['catalog.read', 'variant.price.write'] };
const occupied = (n: number) => Array.from({ length: n }, (_, i) => productId(`x${i}`));

// T079 — Historia 3: cómo se ofrece cada producto (FR-026, FR-027, FR-027a).
describe('PresentationSection', () => {
  let commands: ReturnType<typeof fakeCatalogCommands>;

  beforeEach(() => {
    commands = fakeCatalogCommands();
    commands.setSaleConditions.mockResolvedValue({ ok: true, data: { batchId: 'b1', updated: 1, auditEntryIds: ['e1'] } });
    commands.addToSection.mockResolvedValue({ ok: true, data: { section: 'featured', count: 1 } });
    commands.removeFromSection.mockResolvedValue({ ok: true, data: { section: 'featured', count: 0 } });
    TestBed.configureTestingModule({ imports: [PresentationSection], providers: [provideAccess(), { provide: CATALOG_COMMANDS, useValue: commands }] });
  });

  async function render(overrides: Partial<Product> = {}, sections: FeaturedSections = emptySections()) {
    const fixture = TestBed.createComponent(PresentationSection);
    fixture.componentRef.setInput('tenantId', T1);
    fixture.componentRef.setInput('product', product('p1', 'Camiseta', { version: 3, ...overrides }));
    fixture.componentRef.setInput('sections', sections);
    await settle();
    const root = fixture.nativeElement as HTMLElement;
    const box = (name: string) => root.querySelector<HTMLInputElement>(`[data-field="${name}"] input[type="checkbox"]`);
    const toggle = async (name: string) => {
      const input = box(name);
      if (!input) throw new Error(`No hay casilla ${name}`);
      input.click();
      await settle();
    };
    const button = (label: string) => [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
    const click = async (label: string) => {
      const target = button(label);
      if (!target) throw new Error(`No hay botón «${label}»`);
      target.click();
      await settle();
    };
    const text = () => root.textContent?.replace(/\s+/g, ' ') ?? '';
    return { fixture, root, box, toggle, button, click, text };
  }

  describe('condiciones de venta (FR-026)', () => {
    it('un producto nuevo muestra el precio y no ofrece envío gratis (escenario 1)', async () => {
      const { box } = await render();
      expect([box('priceVisible')?.checked, box('freeShipping')?.checked]).toEqual([true, false]);
    });

    it('se guardan solo las que cambian, con la versión del producto', async () => {
      const { toggle, click } = await render();
      await toggle('priceVisible');
      await click('Guardar condiciones');
      expect(commands.setSaleConditions).toHaveBeenCalledWith(T1, { changes: [{ productId: 'p1', version: 3 }], priceVisible: false });
    });

    it('cambiar solo el envío gratis no manda el precio', async () => {
      const { toggle, click } = await render();
      await toggle('freeShipping');
      await click('Guardar condiciones');
      expect(commands.setSaleConditions).toHaveBeenCalledWith(T1, { changes: [{ productId: 'p1', version: 3 }], freeShipping: true });
    });

    it('un digital no ofrece envío gratis, y dice por qué (escenario 6)', async () => {
      const { box, text } = await render({ kind: 'digital' });
      expect(box('freeShipping')).toBeNull();
      expect(text()).toContain('Un producto digital no se envía: no lleva envío gratis');
    });

    it('sin variant.price.write se ven en solo lectura (FR-003, escenario 3)', async () => {
      useAccess(CATALOG_ACCESS);
      const { box, button, text } = await render({ priceVisible: false, freeShipping: true });
      expect([box('priceVisible')?.checked, box('priceVisible')?.disabled]).toEqual([false, true]);
      expect([box('freeShipping')?.checked, box('freeShipping')?.disabled]).toEqual([true, true]);
      expect(text()).toContain('Las cambia quien puede modificar precios');
      expect(button('Guardar condiciones')).toBeUndefined();
    });

    it('si falla, lo dice y conserva lo elegido', async () => {
      commands.setSaleConditions.mockResolvedValue({ ok: false, code: 'version-conflict', message: 'x' });
      const { toggle, click, text, box } = await render();
      await toggle('freeShipping');
      await click('Guardar condiciones');
      expect(text()).toContain('Alguien más lo editó');
      expect(box('freeShipping')?.checked).toBe(true);
    });
  });

  describe('secciones destacadas (FR-027, FR-027a)', () => {
    it('Destacados y Ofertas con su contador, sin ofrecer crear ni renombrar (escenario 8)', async () => {
      const { root } = await render({}, { featured: occupied(33), offers: occupied(12) });
      const rows = [...root.querySelectorAll('.section')].map((row) => row.textContent?.replace(/\s+/g, ' ').trim());
      expect(rows).toEqual(['Destacados 33 de 40', 'Ofertas 12 de 40']);
    });

    it('el rol de Catálogo, sin permiso de precios, agrega a las dos (escenario 5)', async () => {
      useAccess(CATALOG_ACCESS);
      const { toggle, click } = await render();
      await toggle('featured');
      await toggle('offers');
      await click('Guardar secciones');
      expect(commands.addToSection.mock.calls).toEqual([
        [T1, { section: 'featured', productIds: ['p1'] }],
        [T1, { section: 'offers', productIds: ['p1'] }],
      ]);
    });

    it('sacarlo de una sección la quita', async () => {
      const { toggle, click } = await render({}, { featured: [productId('p1')], offers: [] });
      await toggle('featured');
      await click('Guardar secciones');
      expect(commands.removeFromSection).toHaveBeenCalledWith(T1, { section: 'featured', productIds: ['p1'] });
    });

    it('con la sección completa no se ofrece agregarlo, y lo dice', async () => {
      const { box, text } = await render({}, { featured: [], offers: occupied(40) });
      expect(box('offers')?.disabled).toBe(true);
      expect(text()).toContain('Ofertas está completa: quitá un producto de la sección para agregar este');
    });

    it('si se completó mientras tanto, el rechazo dice cuántos lugares quedan y conserva lo elegido (FR-027b)', async () => {
      commands.addToSection.mockResolvedValue({ ok: false, code: 'section-full', message: 'x', details: { section: 'offers', remaining: 0, requested: 1 } });
      const { toggle, click, text, box } = await render({}, { featured: [], offers: occupied(39) });
      await toggle('offers');
      await click('Guardar secciones');
      expect(text()).toContain('Ofertas no tiene lugar: quedan 0');
      expect(box('offers')?.checked).toBe(true);
    });

    it('en una sección y en borrador, se señala que la tienda no lo muestra ahí', async () => {
      const { text } = await render({ status: 'draft' }, { featured: [productId('p1')], offers: [] });
      expect(text()).toContain('La tienda no lo muestra en Destacados mientras esté en borrador');
    });

    it('activo, no se señala nada', async () => {
      const { text } = await render({ status: 'active' }, { featured: [productId('p1')], offers: [] });
      expect(text()).not.toContain('La tienda no lo muestra');
    });

    it('con solo permiso de precios no se cambian las secciones', async () => {
      useAccess(PRICE_ONLY);
      const { box, button } = await render();
      expect(box('featured')?.disabled).toBe(true);
      expect(button('Guardar secciones')).toBeUndefined();
    });

    it('sin permisos de escritura, todo en solo lectura', async () => {
      useAccess(READ_ONLY_ACCESS);
      const { root } = await render({}, { featured: [productId('p1')], offers: [] });
      expect([...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].every((input) => input.disabled)).toBe(true);
      expect(root.querySelector('button')).toBeNull();
    });
  });

  it('lo elegido sin guardar queda pendiente', async () => {
    const { toggle } = await render();
    await toggle('offers');
    expect(TestBed.inject(PendingChanges).any()).toBe(true);
  });
});

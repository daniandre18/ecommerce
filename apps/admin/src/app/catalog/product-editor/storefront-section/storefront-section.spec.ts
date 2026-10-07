import { TestBed } from '@angular/core/testing';
import { productId, slug as toSlug, type Product } from '@ecommerce/domain';
import { CATALOG_COMMANDS, CATALOG_QUERIES } from '../../../core/client';
import { PendingChanges } from '../../../shared/pending-changes/pending-changes';
import {
  FakeCatalogQueries,
  fakeCatalogCommands,
  product,
  provideAccess,
  READ_ONLY_ACCESS,
  T1,
  useAccess,
} from '../../../../testing/fakes';
import { settle } from '../../../../testing/settle';
import { StorefrontSection } from './storefront-section';

/** Las etiquetas agregadas, por su texto visible (sin el botón de quitar). */
const chips = (root: HTMLElement) => [...root.querySelectorAll('mat-chip .chip-label')].map((label) => label.textContent?.trim());

// T038 — Historia 1: la ficha de tienda en el editor (FR-005 a FR-012).
describe('StorefrontSection', () => {
  let commands: ReturnType<typeof fakeCatalogCommands>;
  let queries: FakeCatalogQueries;

  beforeEach(() => {
    commands = fakeCatalogCommands();
    queries = new FakeCatalogQueries();
    commands.setProductSlug.mockResolvedValue({ ok: true, data: { version: 3, slug: 'te-verde' } });
    commands.updateProductDetails.mockResolvedValue({ ok: true, data: { version: 3 } });
    TestBed.configureTestingModule({
      imports: [StorefrontSection],
      providers: [provideAccess(), { provide: CATALOG_COMMANDS, useValue: commands }, { provide: CATALOG_QUERIES, useValue: queries }],
    });
  });

  async function render(overrides: Partial<Product> = {}) {
    const fixture = TestBed.createComponent(StorefrontSection);
    fixture.componentRef.setInput('tenantId', T1);
    fixture.componentRef.setInput(
      'product',
      product('p1', 'Camiseta', { description: 'Algodón peinado, cuello redondo.', version: 2, slug: toSlug('camiseta'), ...overrides }),
    );
    await settle();
    const root = fixture.nativeElement as HTMLElement;
    const field = (name: string) => root.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-field="${name}"]`);
    const type = async (name: string, value: string) => {
      const input = field(name);
      if (!input) throw new Error(`No hay campo ${name}`);
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle();
    };
    const enter = async (name: string) => {
      field(name)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await settle();
    };
    const button = (text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
    const click = async (text: string) => {
      const target = button(text);
      if (!target) throw new Error(`No hay botón "${text}"`);
      target.click();
      await settle();
    };
    const text = (selector: string) => root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    return { root, fixture, field, type, enter, button, click, text };
  }

  describe('URL amigable (FR-007)', () => {
    it('muestra la vigente', async () => {
      const { field } = await render();
      expect(field('slug')?.value).toBe('camiseta');
    });

    it('mientras se escribe, muestra cómo quedará normalizada y si está libre, antes de guardar', async () => {
      const { type, text } = await render();
      await type('slug', 'Té Verde');
      expect(text('.slug-preview')).toContain('te-verde');
      expect(queries.findSlug).toHaveBeenLastCalledWith(T1, 'te-verde');
      expect(text('.slug-status')).toContain('Disponible');
    });

    it('si la usa otro producto lo dice y no deja guardarla', async () => {
      queries.slugs.set('remera', { productId: productId('p2'), kind: 'current' });
      const { type, text, button } = await render();
      await type('slug', 'remera');
      expect(text('.slug-status')).toContain('La usa otro producto');
      expect(button('Guardar URL')?.disabled).toBe(true);
    });

    it('una anterior del mismo producto se puede recuperar', async () => {
      queries.slugs.set('camiseta-vieja', { productId: productId('p1'), kind: 'previous' });
      const { type, text, button } = await render();
      await type('slug', 'camiseta-vieja');
      expect(text('.slug-status')).toContain('URL anterior de este producto');
      expect(button('Guardar URL')?.disabled).toBe(false);
    });

    it('guarda lo escrito con la versión del producto; el servidor la normaliza', async () => {
      const { type, click } = await render();
      await type('slug', 'Té Verde');
      await click('Guardar URL');
      expect(commands.setProductSlug).toHaveBeenCalledWith(T1, { productId: 'p1', version: 2, slug: 'Té Verde' });
    });

    it('una que no produce ningún carácter válido no se guarda', async () => {
      const { type, text, button } = await render();
      await type('slug', '★★★');
      expect(text('.slug-status')).toContain('al menos una letra o un número');
      expect(button('Guardar URL')?.disabled).toBe(true);
    });

    it('la de respaldo pide que se la reemplace (FR-006)', async () => {
      const { text } = await render({ slug: toSlug('producto-qm9c8zk1'), slugNeedsReplacement: true });
      expect(text('[role="note"]')).toContain('Reemplazá esta URL por una que describa el producto');
    });

    // Defensa ante una migración interrumpida (T042): sin aviso ni estado propio, y sin romperse.
    it('sin URL todavía, el campo queda vacío y no hay aviso', async () => {
      const { field, root } = await render({ slug: null });
      expect(field('slug')?.value).toBe('');
      expect(root.querySelector('[role="note"]')).toBeNull();
    });
  });

  describe('buscadores (FR-009, FR-010)', () => {
    it('vacíos, la vista previa usa el nombre y el comienzo de la descripción, y lo dice', async () => {
      const { text } = await render();
      expect(text('.preview-title')).toBe('Camiseta');
      expect(text('.preview-description')).toBe('Algodón peinado, cuello redondo.');
      expect(text('.preview-note')).toContain('Se usarán el nombre y el comienzo de la descripción');
    });

    it('la vista previa se actualiza mientras se escribe, con la URL vigente', async () => {
      const { type, text } = await render();
      await type('seoTitle', 'Camiseta básica de algodón');
      expect(text('.preview-title')).toBe('Camiseta básica de algodón');
      expect(text('.preview-url')).toContain('camiseta');
    });

    it('cuenta los caracteres y no deja guardar un título de más de 70', async () => {
      const { type, text, click } = await render();
      await type('seoTitle', 'a'.repeat(71));
      expect(text('.seo-title-count')).toBe('71/70');
      await click('Guardar ficha');
      expect(commands.updateProductDetails).not.toHaveBeenCalled();
    });

    it('cuenta hasta 160 en la descripción', async () => {
      const { type, text } = await render();
      await type('seoDescription', 'b'.repeat(12));
      expect(text('.seo-description-count')).toBe('12/160');
    });
  });

  describe('etiquetas y marca (FR-011, FR-012)', () => {
    it('una etiqueta se agrega con Enter y no se repite aunque cambien mayúsculas o acentos', async () => {
      const { type, enter, root } = await render();
      await type('tag', 'Verano');
      await enter('tag');
      await type('tag', 'VERANO');
      await enter('tag');
      expect(chips(root)).toEqual(['Verano']);
    });

    it('sugiere las etiquetas del comercio mientras se escribe; elegir una la agrega con su forma registrada', async () => {
      const { type, text, click, root } = await render();
      queries.vocabularies[0]?.emit({ tags: { algodon: { label: 'Algodón', count: 3 } }, brands: {} });
      await type('tag', 'alg');
      expect(text('.tag-suggestions')).toContain('Algodón');
      await click('Algodón');
      expect(chips(root)).toEqual(['Algodón']);
    });

    it('sugiere las marcas del comercio', async () => {
      const { type, text } = await render();
      queries.vocabularies[0]?.emit({ tags: {}, brands: { nike: { label: 'Nike', count: 1 }, adidas: { label: 'Adidas', count: 1 } } });
      await type('brand', 'ni');
      expect(text('.brand-suggestions')).toContain('Nike');
      expect(text('.brand-suggestions')).not.toContain('Adidas');
    });

    it('guarda buscadores, etiquetas y marca juntos, con la versión del producto', async () => {
      const { type, enter, click } = await render();
      await type('seoTitle', 'Camiseta básica');
      await type('tag', 'Verano');
      await enter('tag');
      await type('brand', 'Nativa');
      await click('Guardar ficha');
      expect(commands.updateProductDetails).toHaveBeenCalledWith(T1, {
        productId: 'p1',
        version: 2,
        seoTitle: 'Camiseta básica',
        seoDescription: '',
        tags: ['Verano'],
        brand: 'Nativa',
      });
    });
  });

  it('sin permiso para escribir el catálogo, todo se lee pero no se edita ni se ofrece guardar', async () => {
    useAccess(READ_ONLY_ACCESS);
    const { field, button } = await render({ tags: ['Verano'], tagsNormalized: ['verano'] });
    expect(field('slug')?.readOnly).toBe(true);
    expect(field('seoTitle')?.readOnly).toBe(true);
    expect(field('tag')).toBeNull();
    expect(button('Guardar URL')).toBeUndefined();
    expect(button('Guardar ficha')).toBeUndefined();
  });

  // FR-034 → FR-039 de la 001: lo escrito sin guardar queda pendiente.
  it('lo escrito sin guardar queda pendiente hasta guardarlo o descartarlo', async () => {
    const { type, click } = await render();
    const pending = () => TestBed.inject(PendingChanges).any();
    await type('seoTitle', 'Otro título');
    expect(pending()).toBe(true);
    await click('Descartar cambios');
    expect(pending()).toBe(false);
  });
});

import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { productId, slug, variantId } from '@ecommerce/domain';
import { CATALOG_COMMANDS, CATALOG_QUERIES } from '../../core/client';
import { FakeCatalogQueries, fakeCatalogCommands, T1 } from '../../../testing/fakes';
import { settle } from '../../../testing/settle';
import { CreateProductDialog } from './create-product-dialog';

describe('CreateProductDialog', () => {
  let commands: ReturnType<typeof fakeCatalogCommands>;
  let queries: FakeCatalogQueries;
  const dialogRef = { close: vi.fn() };

  beforeEach(() => {
    commands = fakeCatalogCommands();
    queries = new FakeCatalogQueries();
    dialogRef.close.mockClear();
    TestBed.configureTestingModule({
      imports: [CreateProductDialog],
      providers: [
        { provide: CATALOG_COMMANDS, useValue: commands },
        { provide: CATALOG_QUERIES, useValue: queries },
        { provide: MAT_DIALOG_DATA, useValue: { tenantId: T1 } },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(CreateProductDialog);
    await settle();
    const root = fixture.nativeElement as HTMLElement;
    const type = async (selector: string, value: string) => {
      const field = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
      if (!field) throw new Error(`No hay campo ${selector}`);
      field.value = value;
      field.dispatchEvent(new Event('input'));
      await settle();
    };
    const submit = async () => {
      root.querySelector('form')?.dispatchEvent(new Event('submit'));
      await settle();
    };
    return { root, type, submit };
  }

  it('pide un nombre antes de enviar', async () => {
    const { root, submit } = await render();
    await submit();
    expect(commands.createProduct).not.toHaveBeenCalled();
    expect(root.textContent).toContain('Ingresá un nombre');
  });

  it('crea el producto y devuelve su id al cerrar', async () => {
    const created = { productId: productId('p1'), variantId: variantId('v1'), slug: slug('camiseta') };
    commands.createProduct.mockResolvedValue({ ok: true, data: created });
    const { type, submit } = await render();
    await type('input', 'Camiseta');
    await type('textarea', 'Algodón');
    await submit();

    expect(commands.createProduct).toHaveBeenCalledWith(T1, { requestId: expect.any(String), name: 'Camiseta', description: 'Algodón' });
    expect(dialogRef.close).toHaveBeenCalledWith({ ...created, name: 'Camiseta' });
  });

  // FR-039: el trabajo no se pierde ante una falla; y el reintento no duplica el producto.
  it('si falla, conserva lo escrito y el reintento usa el mismo requestId', async () => {
    commands.createProduct.mockResolvedValueOnce({ ok: false, code: 'unavailable', message: 'sin red' });
    const { root, type, submit } = await render();
    await type('input', 'Camiseta');
    await submit();

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('No hay conexión con el servidor');
    expect(root.querySelector('input')?.value).toBe('Camiseta');

    commands.createProduct.mockResolvedValueOnce({ ok: true, data: { productId: productId('p1'), variantId: variantId('v1') } });
    await submit();
    const [first, second] = commands.createProduct.mock.calls.map(([, input]) => (input as { requestId: string }).requestId);
    expect(second).toBe(first);
  });

  // T038a — escenario 2 de la Historia 1: la URL que va a recibir, sufijo incluido, antes de confirmar.
  describe('URL amigable (FR-006)', () => {
    const hint = (root: HTMLElement) => root.querySelector('.slug-preview')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

    it('mientras se escribe el nombre, muestra la URL que va a recibir', async () => {
      const { root, type } = await render();
      await type('input', 'Té Verde');
      expect(hint(root)).toContain('…/te-verde');
    });

    it('si está tomada, muestra la del sufijo que va a recibir', async () => {
      queries.slugs.set('camiseta', { productId: productId('p9'), kind: 'current' });
      queries.slugs.set('camiseta-2', { productId: productId('p8'), kind: 'previous' });
      const { root, type } = await render();
      await type('input', 'Camiseta');
      expect(hint(root)).toContain('…/camiseta-3');
    });

    it('un nombre sin letras ni números avisa que se generará una para reemplazar', async () => {
      const { root, type } = await render();
      await type('input', '★★★');
      expect(hint(root)).toContain('Se generará una URL provisoria');
    });

    it('al crear, devuelve la URL final que asignó el servidor', async () => {
      const created = { productId: productId('p1'), variantId: variantId('v1'), slug: slug('camiseta-2') };
      commands.createProduct.mockResolvedValue({ ok: true, data: created });
      const { type, submit } = await render();
      await type('input', 'Camiseta');
      await submit();
      expect(dialogRef.close).toHaveBeenCalledWith(expect.objectContaining({ slug: 'camiseta-2' }));
    });
  });
});

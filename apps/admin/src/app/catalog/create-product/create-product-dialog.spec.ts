import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { productId, variantId } from '@ecommerce/domain';
import { CATALOG_COMMANDS } from '../../core/client';
import { fakeCatalogCommands, T1 } from '../../../testing/fakes';
import { settle } from '../../../testing/settle';
import { CreateProductDialog } from './create-product-dialog';

describe('CreateProductDialog', () => {
  let commands: ReturnType<typeof fakeCatalogCommands>;
  const dialogRef = { close: vi.fn() };

  beforeEach(() => {
    commands = fakeCatalogCommands();
    dialogRef.close.mockClear();
    TestBed.configureTestingModule({
      imports: [CreateProductDialog],
      providers: [
        { provide: CATALOG_COMMANDS, useValue: commands },
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
    const created = { productId: productId('p1'), variantId: variantId('v1') };
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
});

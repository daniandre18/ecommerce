import { TestBed } from '@angular/core/testing';
import { CATALOG_COMMANDS } from '../../core/client';
import { PendingChanges } from '../../shared/pending-changes/pending-changes';
import { fakeCatalogCommands, product, provideAccess, READ_ONLY_ACCESS, T1, useAccess } from '../../../testing/fakes';
import { settle } from '../../../testing/settle';
import { DetailsSection } from './details-section';

describe('DetailsSection', () => {
  let commands: ReturnType<typeof fakeCatalogCommands>;

  beforeEach(() => {
    commands = fakeCatalogCommands();
    commands.updateProductDetails.mockResolvedValue({ ok: true, data: { version: 3 } });
    TestBed.configureTestingModule({ imports: [DetailsSection], providers: [provideAccess(), { provide: CATALOG_COMMANDS, useValue: commands }] });
  });

  async function render() {
    const fixture = TestBed.createComponent(DetailsSection);
    fixture.componentRef.setInput('tenantId', T1);
    fixture.componentRef.setInput('product', product('p1', 'Camiseta', { description: 'Algodón', version: 2 }));
    await settle();
    const root = fixture.nativeElement as HTMLElement;
    const name = () => root.querySelector<HTMLInputElement>('input');
    const type = async (value: string) => {
      const input = name();
      if (!input) throw new Error('No hay campo de nombre');
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle();
    };
    const save = async () => {
      root.querySelector('form')?.dispatchEvent(new Event('submit'));
      await settle();
    };
    return { root, fixture, name, type, save };
  }

  it('guarda nombre y descripción con la versión del producto', async () => {
    const { type, save } = await render();
    await type('Remera');
    await save();
    expect(commands.updateProductDetails).toHaveBeenCalledWith(T1, { productId: 'p1', version: 2, name: 'Remera', description: 'Algodón' });
  });

  it('no deja un producto sin nombre', async () => {
    const { root, type, save } = await render();
    await type('  ');
    await save();
    expect(commands.updateProductDetails).not.toHaveBeenCalled();
    expect(root.textContent).toContain('El producto necesita un nombre');
  });

  it('si alguien más lo editó, lo dice y conserva lo escrito', async () => {
    commands.updateProductDetails.mockResolvedValue({ ok: false, code: 'version-conflict', message: 'cambió' });
    const { root, name, type, save } = await render();
    await type('Remera');
    await save();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Alguien más');
    expect(name()?.value).toBe('Remera');
  });

  // T079: sin catalog.write se leen, pero no se editan ni se ofrece guardar.
  it('sin permiso para escribir el catálogo, nombre y descripción se leen pero no se editan', async () => {
    useAccess(READ_ONLY_ACCESS);
    const { root, name } = await render();
    expect(name()?.value).toBe('Camiseta');
    expect(name()?.readOnly).toBe(true);
    expect(root.querySelector('textarea')?.readOnly).toBe(true);
  });

  // T094 — FR-039: lo escrito y sin guardar queda pendiente, y descartarlo lo libera.
  it('lo escrito sin guardar queda pendiente hasta guardarlo o descartarlo', async () => {
    const { root, type } = await render();
    const pending = () => TestBed.inject(PendingChanges).any();
    expect(pending()).toBe(false);
    await type('Remera');
    expect(pending()).toBe(true);
    [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Descartar cambios')?.click();
    await settle();
    expect(pending()).toBe(false);
  });
});

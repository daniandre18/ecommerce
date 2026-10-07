import { TestBed } from '@angular/core/testing';
import type { Product } from '@ecommerce/domain';
import { CATALOG_COMMANDS } from '../../core/client';
import { PendingChanges } from '../../shared/pending-changes/pending-changes';
import { fakeCatalogCommands, product, provideAccess, READ_ONLY_ACCESS, T1, useAccess } from '../../../testing/fakes';
import { settle } from '../../../testing/settle';
import { ProductVideo } from './product-video';

const IMAGES = [
  { storagePath: 'tenants/t1/products/p1/a.jpg', alt: 'Frente', position: 0 },
  { storagePath: 'tenants/t1/products/p1/b.jpg', alt: 'Espalda', position: 1 },
];

// T040 — FR-018: un video de YouTube o Vimeo, ubicado entre las imágenes del producto.
describe('ProductVideo', () => {
  let commands: ReturnType<typeof fakeCatalogCommands>;

  beforeEach(() => {
    commands = fakeCatalogCommands();
    commands.updateProductDetails.mockResolvedValue({ ok: true, data: { version: 3 } });
    TestBed.configureTestingModule({ imports: [ProductVideo], providers: [provideAccess(), { provide: CATALOG_COMMANDS, useValue: commands }] });
  });

  async function render(overrides: Partial<Product> = {}) {
    const fixture = TestBed.createComponent(ProductVideo);
    fixture.componentRef.setInput('tenantId', T1);
    fixture.componentRef.setInput('product', product('p1', 'Camiseta', { version: 2, images: IMAGES, ...overrides }));
    await settle();
    const root = fixture.nativeElement as HTMLElement;
    const url = () => root.querySelector<HTMLInputElement>('[data-field="videoUrl"]');
    const position = () => root.querySelector<HTMLSelectElement>('select');
    const typeUrl = async (value: string) => {
      const input = url();
      if (!input) throw new Error('No hay campo de enlace');
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle();
    };
    const choosePosition = async (value: string) => {
      const select = position();
      if (!select) throw new Error('No hay posición');
      select.value = value;
      select.dispatchEvent(new Event('change'));
      await settle();
    };
    const button = (label: string) => [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
    const click = async (label: string) => {
      button(label)?.click();
      await settle();
    };
    return { root, url, position, typeUrl, choosePosition, button, click };
  }

  it('un enlace de otra plataforma se rechaza nombrando las admitidas, sin enviar nada', async () => {
    const { typeUrl, root, button } = await render();
    await typeUrl('https://www.dailymotion.com/video/x7tgad0');
    expect(root.textContent).toContain('Solo se admiten videos de YouTube o Vimeo');
    expect(button('Guardar video')?.disabled).toBe(true);
  });

  it('ofrece ubicarlo antes, entre o después de las imágenes', async () => {
    const { position } = await render();
    expect([...(position()?.options ?? [])].map((o) => o.textContent?.trim())).toEqual([
      'Antes de la primera imagen',
      'Después de la imagen 1',
      'Después de la imagen 2',
    ]);
  });

  it('guarda el enlace con su posición, con la versión del producto', async () => {
    const { typeUrl, choosePosition, click } = await render();
    await typeUrl('https://youtu.be/dQw4w9WgXcQ');
    await choosePosition('1');
    await click('Guardar video');
    expect(commands.updateProductDetails).toHaveBeenCalledWith(T1, {
      productId: 'p1',
      version: 2,
      video: { url: 'https://youtu.be/dQw4w9WgXcQ', position: 1 },
    });
  });

  it('el video guardado se muestra con su plataforma y se puede quitar', async () => {
    const { root, click } = await render({ video: { provider: 'vimeo', videoId: '76979871', position: 2 } });
    expect(root.textContent).toContain('Video de Vimeo');
    await click('Quitar video');
    expect(commands.updateProductDetails).toHaveBeenCalledWith(T1, { productId: 'p1', version: 2, video: null });
  });

  it('sin permiso para escribir el catálogo, se ve pero no se cambia', async () => {
    useAccess(READ_ONLY_ACCESS);
    const { url, button } = await render({ video: { provider: 'youtube', videoId: 'dQw4w9WgXcQ', position: 0 } });
    expect(url()).toBeNull();
    expect(button('Quitar video')).toBeUndefined();
  });

  it('un enlace escrito y sin guardar queda pendiente', async () => {
    const { typeUrl } = await render();
    await typeUrl('https://youtu.be/dQw4w9WgXcQ');
    expect(TestBed.inject(PendingChanges).any()).toBe(true);
  });
});

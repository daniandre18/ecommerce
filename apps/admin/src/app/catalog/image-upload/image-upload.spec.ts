import { LiveAnnouncer } from '@angular/cdk/a11y';
import { TestBed } from '@angular/core/testing';
import type { ImageRef } from '@ecommerce/domain';
import { IMAGE_STORAGE } from '../../core/client';
import { FakeImageStorage, T1 } from '../../../testing/fakes';
import { settle } from '../../../testing/settle';
import { ImageUpload } from './image-upload';

const existing: ImageRef[] = [
  { storagePath: 'tenants/t1/products/p1/images/a.png', alt: 'Frente', position: 0 },
  { storagePath: 'tenants/t1/products/p1/images/b.png', alt: 'Dorso', position: 1 },
];

const file = (type = 'image/png', size = 10) => new File([new Uint8Array(size)], 'foto', { type });

// T060 — imágenes con texto alternativo obligatorio (FR-038a) y los bordes del spec: formato o
// peso no admitido, y carga interrumpida a mitad de camino.
describe('ImageUpload', () => {
  let storage: FakeImageStorage;
  let save: ReturnType<typeof vi.fn>;
  const announcer = { announce: vi.fn(async () => undefined) };

  beforeEach(() => {
    storage = new FakeImageStorage();
    save = vi.fn(async () => ({ ok: true, data: { version: 2 } }));
    announcer.announce.mockClear();
    TestBed.configureTestingModule({
      imports: [ImageUpload],
      providers: [
        { provide: IMAGE_STORAGE, useValue: storage },
        { provide: LiveAnnouncer, useValue: announcer },
      ],
    });
  });

  async function render(images: ImageRef[] = existing) {
    const fixture = TestBed.createComponent(ImageUpload);
    fixture.componentRef.setInput('tenantId', T1);
    fixture.componentRef.setInput('productId', 'p1');
    fixture.componentRef.setInput('images', images);
    fixture.componentRef.setInput('save', save);
    await settle();
    const root = fixture.nativeElement as HTMLElement;
    const choose = async (chosen: File) => {
      const input = root.querySelector<HTMLInputElement>('input[type="file"]');
      if (!input) throw new Error('No hay selector de archivo');
      Object.defineProperty(input, 'files', { value: [chosen], configurable: true });
      input.dispatchEvent(new Event('change'));
      await settle();
    };
    const describeAs = async (alt: string) => {
      const input = root.querySelector<HTMLInputElement>('form input');
      if (!input) throw new Error('No hay campo de texto alternativo');
      input.value = alt;
      input.dispatchEvent(new Event('input'));
      await settle();
    };
    const submit = async () => {
      root.querySelector('form')?.dispatchEvent(new Event('submit'));
      await settle();
    };
    const button = (name: string) => [...root.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name);
    return { root, choose, describeAs, submit, button };
  }

  it('muestra las imágenes con su texto alternativo', async () => {
    const { root } = await render();
    expect([...root.querySelectorAll('li img')].map((img) => img.getAttribute('alt'))).toEqual(['Frente', 'Dorso']);
  });

  it.each([
    ['un formato no admitido', file('image/svg+xml'), 'Ese formato no se admite'],
    ['una imagen de más de 5 MB', file('image/png', 5 * 1024 * 1024 + 1), 'pesa más de 5 MB'],
  ])('%s se avisa antes de subir nada', async (_label, chosen, message) => {
    const { root, choose } = await render();
    await choose(chosen);
    expect(storage.uploads).toEqual([]);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(message);
  });

  it('no sube sin texto alternativo (FR-038a)', async () => {
    const { root, choose, submit } = await render();
    await choose(file());
    await submit();
    expect(storage.uploads).toEqual([]);
    expect(root.textContent).toContain('Describí la imagen');
  });

  it('sube y guarda la lista completa con la nueva al final, y lo anuncia', async () => {
    const { choose, describeAs, submit } = await render();
    await choose(file());
    await describeAs(' Detalle de la costura ');
    await submit();
    expect(storage.uploads).toEqual([expect.objectContaining({ tenantId: 't1', productId: 'p1' })]);
    expect(save).toHaveBeenCalledWith([
      ...existing,
      { storagePath: 'tenants/t1/products/p1/images/nueva.png', alt: 'Detalle de la costura', position: 2 },
    ]);
    expect(announcer.announce).toHaveBeenCalledWith('Imagen agregada');
  });

  // FR-039: lo elegido y lo escrito no se pierden; el reintento vuelve a subir.
  it('si la subida se interrumpe, lo dice y conserva el archivo y el texto para reintentar', async () => {
    storage.nextUpload = { ok: false, reason: 'interrupted' };
    const { root, choose, describeAs, submit } = await render();
    await choose(file());
    await describeAs('Frente');
    await submit();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('se interrumpió');
    expect(root.querySelector<HTMLInputElement>('form input')?.value).toBe('Frente');
    expect(save).not.toHaveBeenCalled();

    storage.nextUpload = { ok: true, storagePath: 'tenants/t1/products/p1/images/nueva.png' };
    await submit();
    expect(storage.uploads).toHaveLength(2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('si se subió pero no se pudo guardar, el reintento solo guarda: no vuelve a subir', async () => {
    save.mockResolvedValueOnce({ ok: false, code: 'unavailable', message: 'sin red' });
    const { choose, describeAs, submit } = await render();
    await choose(file());
    await describeAs('Frente');
    await submit();
    await submit();
    expect(storage.uploads).toHaveLength(1);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('quitar una imagen guarda las demás, con las posiciones corridas', async () => {
    const { button } = await render();
    button('Quitar la imagen «Frente»')?.click();
    await settle();
    expect(save).toHaveBeenCalledWith([{ ...existing[1], position: 0 }]);
  });
});

import type { Watcher } from '@ecommerce/application/client';
import { firstValue } from './first-value';

describe('firstValue', () => {
  it('entrega el primer valor y corta la escucha, aunque llegue durante la suscripción', async () => {
    const stop = vi.fn();
    await expect(
      firstValue<number>((watcher) => {
        watcher.next(1);
        watcher.next(2);
        return stop;
      }),
    ).resolves.toBe(1);
    expect(stop).toHaveBeenCalledOnce();
  });

  it('con un valor posterior también corta, y un error rechaza', async () => {
    const stop = vi.fn();
    let later: Watcher<number> | undefined;
    const value = firstValue<number>((watcher) => {
      later = watcher;
      return stop;
    });
    later?.next(5);
    await expect(value).resolves.toBe(5);
    expect(stop).toHaveBeenCalledOnce();

    await expect(
      firstValue<number>((watcher) => {
        watcher.error(new Error('denegado'));
        return () => undefined;
      }),
    ).rejects.toThrow('denegado');
  });
});

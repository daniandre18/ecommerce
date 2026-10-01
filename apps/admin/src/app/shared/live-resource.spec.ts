import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subscription } from '../../testing/fakes';
import { settle } from '../../testing/settle';
import { liveResource } from './live-resource';

describe('liveResource', () => {
  let subscriptions: Subscription<number, string>[];
  const key = signal<string | undefined>('a');

  const create = () =>
    TestBed.runInInjectionContext(() =>
      liveResource<number, string>({
        params: key,
        subscribe: (params, watcher) => {
          const subscription = new Subscription(params, watcher);
          subscriptions.push(subscription);
          return () => {
            subscription.closed = true;
          };
        },
      }),
    );

  beforeEach(() => {
    subscriptions = [];
    key.set('a');
  });

  it('carga hasta el primer valor y después entrega cada cambio', async () => {
    const live = create();
    await settle();
    expect(live.isLoading()).toBe(true);

    subscriptions[0]?.emit(1);
    await settle();
    expect(live.value()).toBe(1);

    subscriptions[0]?.emit(2);
    await settle();
    expect(live.value()).toBe(2);
  });

  it('al cambiar los parámetros corta la suscripción anterior y abre otra', async () => {
    const live = create();
    await settle();
    subscriptions[0]?.emit(1);
    await settle();

    key.set('b');
    await settle();
    expect(subscriptions.map((s) => [s.params, s.closed])).toEqual([
      ['a', true],
      ['b', false],
    ]);
    subscriptions[1]?.emit(7);
    await settle();
    expect(live.value()).toBe(7);
  });

  it('un error queda en el recurso, y reload vuelve a suscribirse', async () => {
    const live = create();
    await settle();
    subscriptions[0]?.fail(new Error('sin permiso'));
    await settle();
    expect(live.error()?.message).toBe('sin permiso');

    live.reload();
    await settle();
    expect(subscriptions).toHaveLength(2);
    expect(subscriptions[0]?.closed).toBe(true);
    subscriptions[1]?.emit(3);
    await settle();
    expect(live.error()).toBeUndefined();
    expect(live.value()).toBe(3);
  });

  it('sin parámetros no se suscribe', async () => {
    key.set(undefined);
    const live = create();
    await settle();
    expect(subscriptions).toEqual([]);
    expect(live.status()).toBe('idle');
  });
});

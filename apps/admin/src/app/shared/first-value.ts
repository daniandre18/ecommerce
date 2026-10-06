import type { Unsubscribe, Watcher } from '@ecommerce/application/client';

/**
 * El primer valor de una suscripción, y la corta. Para lo que se lee una vez —por ejemplo, el
 * nombre de un producto que aparece en la bitácora— sin dejar una escucha abierta.
 */
export function firstValue<T>(subscribe: (watcher: Watcher<T>) => Unsubscribe): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    // El primer valor puede llegar durante `subscribe`, antes de tener con qué cortar: se corta al volver.
    const subscription: { settled: boolean; stop?: Unsubscribe } = { settled: false };
    const settle = (finish: () => void) => {
      if (subscription.settled) return;
      subscription.settled = true;
      finish();
      subscription.stop?.();
    };
    subscription.stop = subscribe({ next: (value) => settle(() => resolve(value)), error: (error) => settle(() => reject(error)) });
    if (subscription.settled) subscription.stop();
  });
}

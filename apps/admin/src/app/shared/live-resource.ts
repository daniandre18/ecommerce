import { resource, signal, type ResourceRef, type ResourceStreamItem } from '@angular/core';
import type { Unsubscribe, Watcher } from '@ecommerce/application/client';

/**
 * Una suscripción en tiempo real como `resource`: carga hasta el primer valor y después entrega
 * cada cambio. Cuando `params` cambia, o con `reload()`, corta la suscripción anterior y abre otra.
 * Con `params` en `undefined` queda inactivo.
 */
export function liveResource<T, P>(options: {
  params: () => P | undefined;
  subscribe: (params: P, watcher: Watcher<T>) => Unsubscribe;
}): ResourceRef<T | undefined> {
  return resource({
    params: options.params,
    stream: ({ params, abortSignal }) =>
      new Promise<ReturnType<typeof signal<ResourceStreamItem<T>>>>((resolve) => {
        let latest: ReturnType<typeof signal<ResourceStreamItem<T>>> | undefined;
        const deliver = (item: ResourceStreamItem<T>) => {
          if (latest) {
            latest.set(item);
          } else {
            latest = signal(item);
            resolve(latest);
          }
        };
        const unsubscribe = options.subscribe(params, {
          next: (value) => deliver({ value }),
          error: (error) => deliver({ error: error instanceof Error ? error : new Error(String(error)) }),
        });
        abortSignal.addEventListener('abort', unsubscribe, { once: true });
      }),
  });
}

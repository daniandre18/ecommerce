import type { Watcher } from '@ecommerce/application';

/** Un documento corrupto que no pasa las factorías del dominio llega como error, no como excepción suelta. */
export function deliver<T>(watcher: Watcher<T>, read: () => T): void {
  let value: T;
  try {
    value = read();
  } catch (error) {
    watcher.error(error);
    return;
  }
  watcher.next(value);
}

import type { Unsubscribe, Watcher } from '@ecommerce/application/client';
import {
  onSnapshot,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
  type SnapshotMetadata,
} from 'firebase/firestore';
import { deliver } from './deliver';

/** Sin respuesta del servidor en este plazo, la lectura se informa como "sin conexión". */
export const OFFLINE_AFTER_MS = 10_000;

/** La lectura no llegó del servidor: sin red, o el servidor no responde. Se puede reintentar. */
export class OfflineError extends Error {
  override readonly name = 'OfflineError';
  readonly code = 'unavailable';
}

/**
 * Sin red, Firestore responde desde su caché local, y lo que no está en caché llega como vacío: un
 * documento "no existe", una consulta "no tiene resultados". Mostrar eso sería presentar un error
 * como si fuera un vacío (FR-037). Por eso la primera entrega espera la confirmación del servidor; si
 * no llega en `offlineAfterMs`, la lectura falla como `OfflineError`, y si el servidor responde
 * después, la vista se recupera sola. Una vez confirmada, lo que siga llegando —también de la caché,
 * si la red se corta después— se entrega: ya es información real.
 */
function confirmedFirst<S extends { readonly metadata: SnapshotMetadata }, T>(watcher: Watcher<T>, read: (snapshot: S) => T, offlineAfterMs: number) {
  let confirmed = false;
  const timer = setTimeout(() => {
    if (!confirmed) watcher.error(new OfflineError('No pudimos conectarnos con el servidor'));
  }, offlineAfterMs);
  return {
    next: (snapshot: S) => {
      if (!confirmed && snapshot.metadata.fromCache) return;
      confirmed = true;
      clearTimeout(timer);
      deliver(watcher, () => read(snapshot));
    },
    error: (error: unknown) => {
      clearTimeout(timer);
      watcher.error(error);
    },
    stop: () => clearTimeout(timer),
  };
}

export function listenToDoc<T>(ref: DocumentReference, watcher: Watcher<T>, read: (snapshot: DocumentSnapshot) => T, offlineAfterMs = OFFLINE_AFTER_MS): Unsubscribe {
  const listener = confirmedFirst(watcher, read, offlineAfterMs);
  const unsubscribe = onSnapshot(ref, { includeMetadataChanges: true }, listener.next, listener.error);
  return () => {
    listener.stop();
    unsubscribe();
  };
}

export function listenToQuery<T>(query: Query, watcher: Watcher<T>, read: (snapshot: QuerySnapshot) => T, offlineAfterMs = OFFLINE_AFTER_MS): Unsubscribe {
  const listener = confirmedFirst(watcher, read, offlineAfterMs);
  const unsubscribe = onSnapshot(query, { includeMetadataChanges: true }, listener.next, listener.error);
  return () => {
    listener.stop();
    unsubscribe();
  };
}

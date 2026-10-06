/// <reference lib="dom" />
import { deleteApp, initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, doc, getFirestore, onSnapshot, setDoc, terminate } from 'firebase/firestore';

// La página que mide (research §14 de la 002): escribe el documento con una app y lo lee con otra,
// nueva y sin caché, como la primera visita del panel.

export interface Target {
  readonly config: Record<string, string>;
  readonly emulator: boolean;
  /** El del emulador, o el del proxy que lo comprime (`apps/admin-e2e/firestore-gzip-proxy.mjs`). */
  readonly port?: number;
}

const open = (target: Target, name: string) => {
  const app = initializeApp(target.config, name);
  const db = getFirestore(app);
  if (target.emulator) connectFirestoreEmulator(db, '127.0.0.1', target.port ?? 8080);
  return { app, db };
};

const scope = window as unknown as { write: (t: Target, data: Record<string, unknown>) => Promise<void>; read: (t: Target) => Promise<number> };

scope.write = async (target, data) => {
  const writer = open(target, `escritor-${Date.now()}`);
  await setDoc(doc(writer.db, 'medicion-compresion', 'arbol'), data);
  await terminate(writer.db);
  await deleteApp(writer.app);
};

/** Como `listen.ts`: la primera entrega confirmada por el servidor. Devuelve lo que tardó, en ms. */
scope.read = async (target) => {
  const reader = open(target, `lector-${Date.now()}`);
  const start = performance.now();
  await new Promise<void>((resolve, reject) => {
    const stop = onSnapshot(
      doc(reader.db, 'medicion-compresion', 'arbol'),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.metadata.fromCache) return;
        stop();
        resolve();
      },
      reject,
    );
  });
  const elapsed = performance.now() - start;
  await terminate(reader.db);
  await deleteApp(reader.app);
  return elapsed;
};

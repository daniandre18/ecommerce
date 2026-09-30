import { defineConfig } from 'vitest/config';

// Pruebas de reglas contra el emulador de Firestore. Se ejecutan con:
//   firebase emulators:exec --only firestore "npm run test:rules"
export default defineConfig({
  test: {
    name: 'rules',
    root: import.meta.dirname,
    include: ['**/*.spec.ts'],
    environment: 'node',
    // Un solo emulador compartido: los archivos no pueden limpiar Firestore en paralelo.
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});

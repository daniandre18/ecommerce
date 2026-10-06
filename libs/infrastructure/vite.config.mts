import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Pruebas de integración contra el emulador de Firestore. Se ejecutan con:
//   firebase emulators:exec --only firestore "npm run test:infrastructure"
export default defineConfig({
  resolve: {
    alias: {
      '@ecommerce/domain': fileURLToPath(new URL('../domain/src/index.ts', import.meta.url)),
      '@ecommerce/application/client': fileURLToPath(new URL('../application/client/src/index.ts', import.meta.url)),
      '@ecommerce/application': fileURLToPath(new URL('../application/src/index.ts', import.meta.url)),
    },
  },
  test: {
    name: 'infrastructure',
    root: import.meta.dirname,
    include: ['src/**/*.integration.spec.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 15000,
  },
});

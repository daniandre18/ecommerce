import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const lib = (path: string) => fileURLToPath(new URL(`../libs/${path}`, import.meta.url));

// Pruebas del sembrador contra los emuladores de Auth y Firestore. Se ejecutan con:
//   firebase emulators:exec --only auth,firestore "npm run test:tools"
export default defineConfig({
  resolve: {
    alias: {
      '@ecommerce/domain': lib('domain/src/index.ts'),
      '@ecommerce/application/client': lib('application/client/src/index.ts'),
      '@ecommerce/application': lib('application/src/index.ts'),
      '@ecommerce/infrastructure/testing': lib('infrastructure/src/testing/emulator.ts'),
      '@ecommerce/infrastructure': lib('infrastructure/src/index.ts'),
    },
  },
  test: {
    name: 'tools',
    root: import.meta.dirname,
    include: ['**/*.integration.spec.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20000,
  },
});

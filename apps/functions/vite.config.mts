import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const lib = (path: string) => fileURLToPath(new URL(`../../libs/${path}`, import.meta.url));

// Pruebas de las entradas de Cloud Functions con dobles de los puertos: sin emulador.
export default defineConfig({
  resolve: {
    alias: {
      '@ecommerce/domain': lib('domain/src/index.ts'),
      '@ecommerce/application/testing': lib('application/src/testing/in-memory.ts'),
      '@ecommerce/application': lib('application/src/index.ts'),
    },
  },
  test: {
    name: 'functions',
    root: import.meta.dirname,
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});

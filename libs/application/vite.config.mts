import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Casos de uso contra dobles de los puertos: sin emuladores.
export default defineConfig({
  resolve: {
    alias: {
      '@ecommerce/domain': fileURLToPath(new URL('../domain/src/index.ts', import.meta.url)),
      '@ecommerce/application/client': fileURLToPath(new URL('./client/src/index.ts', import.meta.url)),
    },
  },
  test: {
    name: 'application',
    root: import.meta.dirname,
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});

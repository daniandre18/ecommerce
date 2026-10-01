import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Pruebas de los adaptadores que no necesitan emulador. Las de integración van con vite.config.mts.
export default defineConfig({
  resolve: {
    alias: {
      '@ecommerce/domain': fileURLToPath(new URL('../domain/src/index.ts', import.meta.url)),
      '@ecommerce/application': fileURLToPath(new URL('../application/src/index.ts', import.meta.url)),
    },
  },
  test: {
    name: 'infrastructure',
    root: import.meta.dirname,
    include: ['src/**/*.spec.ts'],
    exclude: ['src/**/*.integration.spec.ts'],
    environment: 'node',
  },
});

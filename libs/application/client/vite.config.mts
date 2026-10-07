import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Utilidades del cliente, sin emuladores.
export default defineConfig({
  resolve: {
    alias: {
      '@ecommerce/domain': fileURLToPath(new URL('../../domain/src/index.ts', import.meta.url)),
    },
  },
  test: {
    name: 'application-client',
    root: import.meta.dirname,
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});

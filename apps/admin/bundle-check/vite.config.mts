import { defineConfig } from 'vitest/config';

// Pruebas sobre el build de producción del panel, no sobre su código: `admin:bundle-check` construye antes.
export default defineConfig({
  test: {
    name: 'admin-bundle',
    root: import.meta.dirname,
    include: ['**/*.spec.ts'],
    environment: 'node',
  },
});

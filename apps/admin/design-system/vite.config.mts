import { defineConfig } from 'vitest/config';

// Las compuertas del sistema de diseño (003): leen el SCSS compilado y el código del panel, no lo
// ejecutan en un navegador. `admin:test` depende de este objetivo, así que el trabajo `unit` de CI lo
// corre con `nx run-many -t test`.
export default defineConfig({
  test: {
    name: 'admin-design-system',
    root: import.meta.dirname,
    include: ['**/*.spec.ts'],
    exclude: ['fixtures/**', 'node_modules/**'],
    environment: 'node',
    // Mientras se arma la fase, puede no haber pruebas todavía (T003 → T004).
    passWithNoTests: true,
  },
});

import { defineConfig } from 'vitest/config';
import { aliases } from './vite.aliases.mjs';

// Pruebas de las entradas de Cloud Functions con dobles de los puertos: sin emulador.
export default defineConfig({
  resolve: { alias: aliases },
  test: {
    name: 'functions',
    root: import.meta.dirname,
    include: ['src/**/*.spec.ts'],
    exclude: ['src/**/*.integration.spec.ts'],
    environment: 'node',
  },
});

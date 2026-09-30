import { defineConfig } from 'vitest/config';

// Dominio puro: sin emuladores, sin Firebase, sin Angular.
export default defineConfig({
  test: {
    name: 'domain',
    root: import.meta.dirname,
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    globals: false,
  },
});

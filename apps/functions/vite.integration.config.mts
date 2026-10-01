import { defineConfig } from 'vitest/config';
import { aliases } from './vite.aliases.mjs';

// Las callable contra el emulador de Firestore. Se ejecutan con:
//   firebase emulators:exec --only firestore "npm run test:functions"
export default defineConfig({
  resolve: { alias: aliases },
  test: {
    name: 'functions-integration',
    root: import.meta.dirname,
    include: ['src/**/*.integration.spec.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 15000,
  },
});

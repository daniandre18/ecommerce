import { defineConfig, devices } from '@playwright/test';

const APP_URL = 'http://localhost:4300';

/**
 * Rendimiento percibido (T099, SC-008, SC-009), aparte de los recorridos: se mide sobre el build
 * optimizado —el servidor de desarrollo entrega el código sin empaquetar y no dice nada— apuntado a
 * los emuladores, con la configuración `measure` del panel.
 */
export default defineConfig({
  testDir: './src',
  testMatch: 'performance.spec.ts',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  globalTimeout: 10 * 60_000,
  reporter: 'list',
  use: { baseURL: APP_URL },
  projects: [{ name: 'movil', use: { ...devices['Pixel 7'], browserName: 'chromium' } }],
  webServer: [
    {
      command: 'npx nx run functions:build && firebase emulators:start --only auth,firestore,functions,storage --project demo-ecommerce',
      url: 'http://127.0.0.1:4400/emulators',
      cwd: '../..',
      reuseExistingServer: true,
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGINT', timeout: 15_000 },
    },
    {
      command: 'npx nx run admin:build:measure --skip-nx-cache && node apps/admin-e2e/perf-server.mjs dist/apps/admin-measure/browser 4300',
      url: APP_URL,
      cwd: '../..',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});

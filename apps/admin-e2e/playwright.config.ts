import { defineConfig, devices } from '@playwright/test';

const APP_URL = 'http://localhost:4200';

/**
 * Recorridos de extremo a extremo contra el panel servido localmente y los emuladores de Firebase.
 * Nunca contra un proyecto real: los emuladores corren con un proyecto `demo-*`.
 */
export default defineConfig({
  testDir: './src',
  // El rendimiento se mide aparte, sobre el build optimizado: `nx run admin-e2e:perf`.
  testIgnore: 'performance.spec.ts',
  globalSetup: './global-setup.ts',
  // En serie: todas las pruebas comparten el comercio sembrado en los emuladores. Con varios
  // navegadores a la vez se observaron cuelgues intermitentes —navegadores ociosos esperando, con
  // los emuladores atendiendo al resto— cuya causa no se encontró; en serie no aparecieron.
  fullyParallel: false,
  workers: 1,
  // Un cuelgue no puede retener la corrida: falla entera a los 10 minutos.
  globalTimeout: 10 * 60_000,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: APP_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    // FR-038: los flujos frecuentes tienen que completarse a 360 px sin desplazamiento horizontal.
    {
      name: 'movil-360',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: [
    {
      // Las callable corren desde su paquete: se empaqueta antes de levantar el emulador de Functions.
      command: 'npx nx run functions:build && firebase emulators:start --only auth,firestore,functions,storage --project demo-ecommerce',
      url: 'http://127.0.0.1:4400/emulators',
      cwd: '../..',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
      // Sin apagado ordenado, el CLI de Firebase muere pero el proceso Java del emulador queda
      // huérfano ocupando el puerto 8080, y la corrida siguiente no puede arrancar.
      gracefulShutdown: { signal: 'SIGINT', timeout: 15_000 },
    },
    {
      command: 'npx nx serve admin',
      url: APP_URL,
      cwd: '../..',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
  ],
});

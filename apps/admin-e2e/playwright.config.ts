import { defineConfig, devices, type Project } from '@playwright/test';
import { FIRST_HALF } from './shards';

/**
 * Un puerto propio, no el 4200 que usa `nx serve` por omisión: con `reuseExistingServer`, cualquier
 * servidor que ya escuche en ese puerto —otro proyecto, una sesión de desarrollo— se tomaría por el
 * panel, y la e2e probaría otra cosa o fallaría sin explicación.
 */
const APP_PORT = 4320;
const APP_URL = `http://localhost:${APP_PORT}`;

/**
 * En CI, la e2e corre en dos mitades paralelas, repartidas por duración medida (research §15 de la 003).
 * La mitad 1 es la lista de `shards.ts`; la 2, todo lo demás, así que una prueba nueva cae en la 2 y
 * nunca queda fuera. Sin `E2E_SHARD`, corre todo.
 */
const SHARD = process.env['E2E_SHARD'];
if (SHARD !== undefined && SHARD !== '1' && SHARD !== '2') throw new Error(`E2E_SHARD tiene que ser 1 o 2, no "${SHARD}"`);
const IGNORED = ['performance.spec.ts'];

function half(project: Project): Project {
  if (SHARD === undefined) return project;
  const listed = [...(FIRST_HALF[project.name as string] ?? [])];
  const allowed = project.testMatch as string[] | undefined;
  if (SHARD === '1') return { ...project, testMatch: allowed ? listed.filter((file) => allowed.includes(file)) : listed };
  return { ...project, testIgnore: [...IGNORED, ...listed] };
}

/**
 * Recorridos de extremo a extremo contra el panel servido localmente y los emuladores de Firebase.
 * Nunca contra un proyecto real: los emuladores corren con un proyecto `demo-*`.
 */
export default defineConfig({
  testDir: './src',
  // El rendimiento se mide aparte, sobre el build optimizado: `nx run admin-e2e:perf`.
  testIgnore: IGNORED,
  globalSetup: './global-setup.ts',
  // En serie: todas las pruebas comparten el comercio sembrado en los emuladores. Con varios
  // navegadores a la vez se observaron cuelgues intermitentes —navegadores ociosos esperando, con
  // los emuladores atendiendo al resto— cuya causa no se encontró; en serie no aparecieron.
  fullyParallel: false,
  workers: 1,
  // Un cuelgue no puede retener la corrida: falla entera a los 10 minutos. En CI corre en dos mitades
  // (`E2E_SHARD`), y el tope vale para cada una (research §15 de la 003).
  globalTimeout: 10 * 60_000,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  // En CI, además, la duración de cada prueba en JSON: con ella se reparten las dos mitades del trabajo.
  reporter: process.env['CI'] ? [['github'], ['json', { outputFile: 'reports/e2e.json' }]] : 'list',
  use: {
    baseURL: APP_URL,
    trace: 'on-first-retry',
  },
  projects: ([
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    // FR-038: los flujos frecuentes tienen que completarse a 360 px sin desplazamiento horizontal.
    {
      name: 'movil-360',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true },
    },
    // FR-002 y SC-003 de la 003: el panel en su esquema oscuro, por preferencia del sistema operativo.
    // Solo las pruebas que miran color y contraste; el resto no cambia con el esquema.
    {
      name: 'oscuro',
      use: { ...devices['Desktop Chrome'], colorScheme: 'dark' },
      testMatch: ['a11y.spec.ts', 'design-system.spec.ts'],
    },
  ] satisfies Project[]).map(half),
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
      command: `npx nx serve admin --port ${APP_PORT}`,
      url: APP_URL,
      cwd: '../..',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
  ],
});

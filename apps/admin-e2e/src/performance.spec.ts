import { expect, test, type Page } from '@playwright/test';
import { call, EMULATORS, idTokenOf, OWNER, signIn } from './support';

/**
 * "Conexión móvil típica" (SC-009), en números: el perfil móvil de Lighthouse, "Slow 4G" —150 ms de
 * latencia, 1,6 Mbps de bajada y 750 kbps de subida— con el procesador 4 veces más lento, que es
 * como Lighthouse aproxima un teléfono de gama media.
 */
const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };
const CPU_SLOWDOWN = 4;

/** SC-009: estructura visible en menos de 1 segundo y contenido útil en menos de 3. */
const STRUCTURE_MS = 1_000;
const CONTENT_MS = 3_000;

/**
 * "Sin degradación perceptible" (SC-008), en números: con 100 colaboradores, el catálogo tarda a lo
 * sumo un 20% más, o 100 ms, lo que sea mayor: por debajo de eso no se nota.
 */
const DEGRADATION = { ratio: 1.2, ms: 100 };

/** La medición queda en el reporte y en la salida: es el dato que se busca al correr esto. */
function report(measurement: string) {
  test.info().annotations.push({ type: 'medición', description: measurement });
  console.log(measurement);
}

interface Timing {
  readonly structure: number;
  readonly content: number;
}

/**
 * Abre el catálogo con la red y el procesador de un teléfono. En frío, como la primera visita: sin
 * nada en la caché. En caliente, como las siguientes: el código —con hash en el nombre— ya está en la
 * caché del navegador y solo viajan los datos.
 */
async function openCatalog(page: Page, cache: 'cold' | 'warm'): Promise<Timing> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  if (cache === 'cold') await cdp.send('Network.clearBrowserCache');
  await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
  try {
    await page.goto('/t/t1/catalog', { waitUntil: 'commit' });
    // El contenido útil: el primer producto del listado, pintado. Lo marca la propia página
    // (`markFirstProduct`); medirlo desde Playwright sumaba hasta 300 ms de idas y vueltas.
    await page.locator('main ul li a').first().waitFor({ timeout: 15_000 });
    const content = await page.evaluate(
      () => new Promise<number>((resolve) => {
        const read = () => {
          const mark = performance.getEntriesByName('primer-producto')[0];
          if (mark) resolve(mark.startTime);
          else requestAnimationFrame(read);
        };
        read();
      }),
    );
    // La estructura visible: la primera pintura con contenido (FCP), la métrica estándar para eso.
    const structure = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? Infinity);
    return { structure, content };
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  }
}

/**
 * Marca `primer-producto` en el primer cuadro pintado con un producto del listado: el producto entra
 * al DOM, el cuadro siguiente lo pinta, y la tarea que sigue a ese cuadro ya lo tiene en pantalla.
 */
async function markFirstProduct(page: Page) {
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (!document.querySelector('main ul li a')) return;
      observer.disconnect();
      requestAnimationFrame(() => setTimeout(() => performance.mark('primer-producto')));
    }).observe(document, { childList: true, subtree: true });
  });
}

/** La mediana de tres entradas: una sola corrida mide también el ruido de la máquina. */
async function median(page: Page, cache: 'cold' | 'warm'): Promise<Timing> {
  const runs: Timing[] = [];
  for (let i = 0; i < 3; i++) runs.push(await openCatalog(page, cache));
  const middle = (values: number[]) => [...values].sort((a, b) => a - b)[1] ?? 0;
  return { structure: middle(runs.map((r) => r.structure)), content: middle(runs.map((r) => r.content)) };
}

/** Membresías activas de catálogo en t1, escritas como administrador del emulador. */
async function addCollaborators(count: number) {
  for (let i = 0; i < count; i++) {
    const uid = `perf-${i}`;
    const fields = {
      uid: { stringValue: uid },
      status: { stringValue: 'active' },
      roleId: { stringValue: 'catalog' },
      isOwner: { booleanValue: false },
      displayName: { stringValue: `Colaborador ${i}` },
      email: { stringValue: `${uid}@t1.test` },
    };
    await fetch(`${EMULATORS.firestore}/v1/projects/demo-ecommerce/databases/(default)/documents/tenants/t1/members?documentId=${uid}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ fields }),
    });
  }
}

// T099 — SC-008 y SC-009 medidos, no estimados. Corre con `npx nx run admin-e2e:perf`.
test.describe('rendimiento percibido en un teléfono', () => {
  test.describe.configure({ timeout: 180_000 });
  const results: Record<string, Timing> = {};

  test.beforeAll(async () => {
    const token = await idTokenOf(OWNER);
    for (let i = 0; i < 30; i++) await call(token, 'createProduct', { tenantId: 't1', requestId: crypto.randomUUID(), name: `Producto ${i}` });
  });

  test.beforeEach(async ({ page }) => {
    await markFirstProduct(page);
    await page.goto('/login');
    await signIn(page, OWNER);
  });

  test('SC-009, primera visita: estructura en menos de 1 s y contenido útil en menos de 3 s', async ({ page }) => {
    results['cold'] = await median(page, 'cold');
    report(`SC-009 primera visita: estructura ${Math.round(results['cold'].structure)} ms, contenido ${Math.round(results['cold'].content)} ms`);
    expect.soft(results['cold'].structure, 'estructura visible (ms)').toBeLessThan(STRUCTURE_MS);
    expect.soft(results['cold'].content, 'contenido útil (ms)').toBeLessThan(CONTENT_MS);
  });

  test('SC-009, visitas siguientes: estructura en menos de 1 s y contenido útil en menos de 3 s', async ({ page }) => {
    await openCatalog(page, 'cold');
    results['warm'] = await median(page, 'warm');
    report(`SC-009 visitas siguientes: estructura ${Math.round(results['warm'].structure)} ms, contenido ${Math.round(results['warm'].content)} ms`);
    expect.soft(results['warm'].structure, 'estructura visible (ms)').toBeLessThan(STRUCTURE_MS);
    expect.soft(results['warm'].content, 'contenido útil (ms)').toBeLessThan(CONTENT_MS);
  });

  test('SC-008: con 100 colaboradores, el catálogo no se degrada', async ({ page }) => {
    const before = results['cold'] ?? (await median(page, 'cold'));
    await addCollaborators(100);
    const after = await median(page, 'cold');
    report(`SC-008: contenido ${Math.round(before.content)} ms → ${Math.round(after.content)} ms con 100 colaboradores`);
    expect(after.content).toBeLessThanOrEqual(Math.max(before.content * DEGRADATION.ratio, before.content + DEGRADATION.ms));
  });
});

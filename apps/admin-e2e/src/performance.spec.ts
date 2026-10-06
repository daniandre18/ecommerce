import { expect, test, type Page } from '@playwright/test';
import { call, EMULATORS, idTokenOf, OWNER, signIn } from './support';
import { branchOf, firstMatch, maxTree, seedTree, seedVolume, type VolumeCatalog } from './volume';

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

/** El perfil móvil, puesto y quitado alrededor de `work`. */
async function onAPhone<T>(page: Page, cache: 'cold' | 'warm' | 'keep', work: () => Promise<T>): Promise<T> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  if (cache === 'cold') await cdp.send('Network.clearBrowserCache');
  await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
  try {
    return await work();
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  }
}

/** Marca `contenido-util` en el primer cuadro pintado con `selector` en pantalla, como `markFirstProduct`. */
async function markContent(page: Page, selector: string) {
  await page.addInitScript((target) => {
    new MutationObserver((_, observer) => {
      if (!document.querySelector(target)) return;
      observer.disconnect();
      requestAnimationFrame(() => setTimeout(() => performance.mark('contenido-util')));
    }).observe(document, { childList: true, subtree: true });
  }, selector);
}

/** Abre una vista con el perfil móvil: estructura (FCP) y contenido útil (la marca de `markContent`). */
async function openView(page: Page, url: string, selector: string, cache: 'cold' | 'warm'): Promise<Timing> {
  return onAPhone(page, cache, async () => {
    await page.goto(url, { waitUntil: 'commit' });
    await page.locator(selector).first().waitFor({ timeout: 15_000 });
    const content = await page.evaluate(
      () => new Promise<number>((resolve) => {
        const read = () => {
          const mark = performance.getEntriesByName('contenido-util')[0];
          if (mark) resolve(mark.startTime);
          else requestAnimationFrame(read);
        };
        read();
      }),
    );
    const structure = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? Infinity);
    return { structure, content };
  });
}

/**
 * Lo que tarda un filtro, medido en la página: desde que la persona lo cambia —el evento `change` del
 * selector o el último `input` del campo, que incluye la espera de 300 ms para terminar de escribir—
 * hasta el primer cuadro pintado con `expected` primero en el listado.
 */
async function timeFilter(page: Page, expected: string, apply: () => Promise<void>): Promise<number> {
  const showing = await page.locator('main ul li a').first().textContent({ timeout: 15_000 }).catch(() => '');
  if (showing?.includes(expected)) throw new Error(`«${expected}» ya está primero: el filtro no mediría nada`);
  await page.evaluate((target) => {
    const scope = window as unknown as { filterTime: Promise<number> };
    scope.filterTime = new Promise((resolve) => {
      let start = 0;
      const changed = () => (start = performance.now());
      document.addEventListener('change', changed, { capture: true });
      document.addEventListener('input', changed, { capture: true });
      const observer = new MutationObserver(() => {
        if (!start || !document.querySelector('main ul li a')?.textContent?.includes(target)) return;
        observer.disconnect();
        document.removeEventListener('change', changed, { capture: true });
        document.removeEventListener('input', changed, { capture: true });
        requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - start)));
      });
      observer.observe(document.querySelector('main') as Node, { childList: true, subtree: true, characterData: true });
    });
  }, expected);
  await apply();
  return page.evaluate(() => (window as unknown as { filterTime: Promise<number> }).filterTime);
}

const percentile = (values: readonly number[], p: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] ?? Infinity;

// T094 de la 002 — SC-006 y las vistas nuevas con el perfil móvil de arriba (SC-008 de la 002 →
// SC-009 de la 001). El comercio de referencia: 10.000 variantes y 300 categorías.
test.describe('catálogo de cara a la tienda en un teléfono', () => {
  test.describe.configure({ timeout: 300_000 });
  let catalog: VolumeCatalog;

  test.beforeAll(async () => {
    catalog = await seedVolume();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await signIn(page, OWNER);
  });

  test('SC-006: el 95% de los filtros por categoría, etiqueta o marca devuelve resultados en menos de 1 s', async ({ page }) => {
    // El listado sin filtrar empieza por el último editado, que puede no ser del volumen (las pruebas
    // de arriba crean productos): un filtro cuyo primero sea ese no mediría nada.
    await page.goto('/t/t1/catalog');
    const unfiltered = ((await page.locator('main ul li a .name').first().textContent({ timeout: 15_000 })) ?? '').trim();
    const byCategory = ['r00', 'r01', 'r02', 'r03', 'r04', 'r05-c0', 'r06-c1-n2', 'r07-c2-n3'].map((id) => {
      const branch = new Set<string>(branchOf(catalog.tree, id));
      return { kind: 'category' as const, value: id, first: firstMatch(catalog, (p) => p.categoryIds.some((c) => branch.has(c))) };
    });
    const byTag = catalog.tags.slice(0, 8).map((tag) => ({ kind: 'tag' as const, value: tag, first: firstMatch(catalog, (p) => p.tags.includes(tag)) }));
    const byBrand = catalog.brands.slice(0, 8).map((brand) => ({ kind: 'brand' as const, value: brand, first: firstMatch(catalog, (p) => p.brand === brand) }));
    // Cada grupo arranca desde el listado sin filtrar, y dentro del grupo, desde el filtro anterior.
    const usable = <T extends { first: string }>(group: readonly T[]) =>
      group.filter((f, i) => f.first !== unfiltered && f.first !== group[i - 1]?.first).slice(0, 6);
    // Dos vueltas: con 18 muestras el percentil 95 es el máximo, y una sola demora lo decidiría.
    const round = [...usable(byCategory), ...usable(byTag), ...usable(byBrand)];
    expect(round.length).toBeGreaterThanOrEqual(18);
    const filters = [...round, ...round];
    // La rama grande, de 49 ids, pide dos consultas de hasta 30: el camino caro también se mide.
    expect(branchOf(catalog.tree, 'r00')).toHaveLength(49);
    expect(filters.map((f) => f.value)).toContain('r00');

    const show = page.getByLabel('Mostrar');
    const times: number[] = [];
    const byKind: Record<string, string[]> = { category: [], tag: [], brand: [] };
    await onAPhone(page, 'keep', async () => {
      for (const filter of filters) {
        if (filter.kind === 'category') {
          if ((await show.inputValue()) !== 'category') await show.selectOption('category');
          times.push(await timeFilter(page, filter.first, () => page.locator('[data-field="category"]').selectOption(filter.value).then(() => undefined)));
          byKind['category']?.push(`${filter.value} ${Math.round(times.at(-1) ?? 0)}`);
        } else {
          if ((await show.inputValue()) !== filter.kind) {
            await show.selectOption('none');
            await expect(page.locator('main ul li a').first()).toContainText(unfiltered);
            await show.selectOption(filter.kind);
          }
          times.push(await timeFilter(page, filter.first, () => page.locator('[data-field="attributeValue"]').fill(filter.value)));
          byKind[filter.kind]?.push(`${filter.value} ${Math.round(times.at(-1) ?? 0)}`);
        }
      }
    });
    const [p50, p95, max] = [percentile(times, 0.5), percentile(times, 0.95), Math.max(...times)].map(Math.round);
    report(`SC-006: ${times.length} filtros, p50 ${p50} ms, p95 ${p95} ms, máximo ${max} ms (etiqueta y marca incluyen 300 ms de espera al escribir)`);
    for (const [kind, measured] of Object.entries(byKind)) report(`SC-006, ${kind} (ms): ${measured.join(' · ')}`);
    expect(p95).toBeLessThan(1_000);
  });

  // Las dos vistas, con el árbol en el tope de Assumptions: 1.000 categorías. Si cumplieran con 300 y
  // no con 1.000, no cumplen.
  for (const view of [
    { name: 'el editor del árbol, con 1.000 categorías', url: () => '/t/t1/categories', content: 'main li[data-category]' },
    { name: 'el editor de producto con sus secciones nuevas, con 1.000 categorías', url: () => `/t/t1/catalog/${catalog.products.at(-1)?.id}`, content: 'main [role="group"]' },
  ]) {
    test(`SC-008 de la 002, ${view.name}: estructura en menos de 1 s y contenido útil en menos de 3 s`, async ({ page }) => {
      const tree = maxTree();
      expect(Object.keys(tree.nodes)).toHaveLength(1_000);
      await seedTree(tree);
      await markContent(page, view.content);
      const middle = async (cache: 'cold' | 'warm') => {
        const runs: Timing[] = [];
        for (let i = 0; i < 3; i++) runs.push(await openView(page, view.url(), view.content, cache));
        const median = (values: number[]) => [...values].sort((a, b) => a - b)[1] ?? 0;
        return { structure: median(runs.map((r) => r.structure)), content: median(runs.map((r) => r.content)) };
      };
      const cold = await middle('cold');
      const warm = await middle('warm');
      report(`SC-008 de la 002, ${view.name}: primera visita ${Math.round(cold.structure)}/${Math.round(cold.content)} ms, siguientes ${Math.round(warm.structure)}/${Math.round(warm.content)} ms (estructura/contenido)`);
      for (const [visit, timing] of [['primera visita', cold], ['siguientes', warm]] as const) {
        expect.soft(timing.structure, `${visit}: estructura visible (ms)`).toBeLessThan(STRUCTURE_MS);
        expect.soft(timing.content, `${visit}: contenido útil (ms)`).toBeLessThan(CONTENT_MS);
      }
    });
  }
});

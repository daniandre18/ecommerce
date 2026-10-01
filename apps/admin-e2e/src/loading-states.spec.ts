import { expect, test, type Page } from '@playwright/test';
import { MULTI, OWNER, productAsOwner, signIn } from './support';

/** Lo que tarda en llegar cada respuesta de Firestore: suficiente para ver el esqueleto. */
const DELAY_MS = 600;

/**
 * Suma de los saltos de diseño del documento (CLS), sin contar los que siguen a una acción de la
 * persona: esos los espera. Se instala antes de cargar la página para no perder los primeros.
 */
async function measureLayoutShifts(page: Page) {
  await page.addInitScript(() => {
    const scope = window as unknown as { layoutShift: number };
    scope.layoutShift = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!entry.hadRecentInput) scope.layoutShift += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

const layoutShift = (page: Page) => page.evaluate(() => (window as unknown as { layoutShift: number }).layoutShift);

/** Firestore responde tarde: lo que ve quien tiene una conexión lenta. */
async function slowFirestore(page: Page) {
  await page.route(/127\.0\.0\.1:8080\/google\.firestore\.v1\.Firestore\//, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    await route.continue();
  });
}

/** Abre la vista con la sesión ya iniciada y Firestore lento; devuelve cuánto saltó al cargar. */
async function loadSlowly(page: Page, url: string, ready: (page: Page) => Promise<void>): Promise<number> {
  await measureLayoutShifts(page);
  await slowFirestore(page);
  await page.goto(url);
  await expect(page.locator('ui-skeleton').first()).toBeVisible();
  await ready(page);
  await expect(page.locator('ui-skeleton')).toHaveCount(0);
  // Lo que se acomoda justo después de llegar el contenido también cuenta.
  await page.waitForTimeout(300);
  return layoutShift(page);
}

/** "0 saltos perceptibles" (SC-009): por debajo de esto no se nota; 0,1 ya es el límite de "bueno". */
const IMPERCEPTIBLE = 0.01;

// T090 — SC-012 y FR-036: cada vista muestra su esqueleto, y al completarse la carga no salta.
test.describe('estados de carga', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/t\/t1\/catalog$/);
  });

  test('catálogo', async ({ page }) => {
    const shift = await loadSlowly(page, '/t/t1/catalog', (p) => expect(p.getByRole('heading', { name: 'Catálogo' })).toBeVisible());
    expect(shift).toBeLessThan(IMPERCEPTIBLE);
  });

  test('editor de producto', async ({ page }) => {
    const { url } = await productAsOwner(`Carga ${Date.now()}`);
    const shift = await loadSlowly(page, url, (p) => expect(p.getByRole('group', { name: /^Única/ })).toBeVisible());
    expect(shift).toBeLessThan(IMPERCEPTIBLE);
  });

  test('equipo', async ({ page }) => {
    const shift = await loadSlowly(page, '/t/t1/team', (p) => expect(p.getByRole('heading', { name: 'Roles' })).toBeVisible());
    expect(shift).toBeLessThan(IMPERCEPTIBLE);
  });

  test('editor de rol', async ({ page }) => {
    const shift = await loadSlowly(page, '/t/t1/team/roles/catalog', (p) => expect(p.getByRole('checkbox').first()).toBeVisible());
    expect(shift).toBeLessThan(IMPERCEPTIBLE);
  });

  test('bitácora', async ({ page }) => {
    const shift = await loadSlowly(page, '/t/t1/audit', (p) => expect(p.getByLabel('Tipo de evento')).toBeVisible());
    expect(shift).toBeLessThan(IMPERCEPTIBLE);
  });
});

// FR-037: el vacío no se presenta como error, y el error ofrece reintentar.
test.describe('vacío y error', () => {
  test('un comercio sin productos invita a crear el primero', async ({ page }) => {
    await page.goto('/login');
    await signIn(page, MULTI);
    await page.getByRole('link', { name: /Comercio Dos/ }).click();
    await expect(page.getByText('Todavía no hay productos')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear producto' })).toBeVisible();
  });

  test('un comercio sin acceso lo dice y ofrece reintentar', async ({ page }) => {
    await page.goto('/login');
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/t\/t1\/catalog$/);
    await page.goto('/t/t2/catalog');
    await expect(page.getByText('No pudimos abrir este comercio')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { call, idTokenOf, MULTI, OWNER, productAsOwner, signIn } from './support';

/** Los criterios de nivel A y AA de WCAG 2.0, 2.1 y 2.2: lo que exige SC-014. */
const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

/**
 * Cero incumplimientos; si hay, la falla dice cuáles y dónde, no solo cuántos. Se evalúa la vista
 * quieta: a mitad de una animación de apertura el contraste medido es el de un elemento a medio
 * aparecer, no el que ve la persona.
 */
async function expectAccessible(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        // Las infinitas (un indicador de progreso) no terminan nunca, y una cancelada ya no importa.
        .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  expect(violations.map((v) => ({ rule: v.id, impact: v.impact, where: v.nodes.map((n) => n.target.join(' ')) }))).toEqual([]);
}

/** Espera a que la vista termine de cargar: el esqueleto no es lo que se evalúa. */
async function loaded(page: Page) {
  await expect(page.locator('ui-skeleton')).toHaveCount(0);
}

// T089 — SC-014: todas las vistas del panel, sin incumplimientos de nivel A ni AA de WCAG 2.2.
test.describe('accesibilidad', () => {
  test('inicio de sesión y alta de cuenta', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await expectAccessible(page);
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: 'Crear cuenta' })).toBeVisible();
    await expectAccessible(page);
  });

  test('selección de comercio y catálogo vacío', async ({ page }) => {
    await page.goto('/login');
    await signIn(page, MULTI);
    await expect(page.getByRole('heading', { name: 'Tus comercios' })).toBeVisible();
    await expectAccessible(page);
    await page.goto('/t/t2/catalog');
    await loaded(page);
    await expectAccessible(page);
  });

  test('catálogo, alta de producto y editor', async ({ page }) => {
    const { productId, variantId, url } = await productAsOwner(`Accesible ${Date.now()}`);
    const color = {
      id: 'color',
      name: 'Color',
      position: 0,
      values: [
        { id: 'rojo', label: 'Rojo', position: 0 },
        { id: 'azul', label: 'Azul', position: 1 },
      ],
    };
    const options = await call(await idTokenOf(OWNER), 'setProductOptions', {
      tenantId: 't1',
      productId,
      version: 1,
      options: [color],
      assignments: [{ variantId, optionId: 'color', valueId: 'rojo' }],
    });
    expect(options.status).toBe(200);
    await page.goto('/t/t1/catalog');
    await signIn(page, OWNER);
    await loaded(page);
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Nuevo producto' }).click();
    await expect(page.getByRole('dialog', { name: 'Nuevo producto' })).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press('Escape');

    await page.goto(url);
    await loaded(page);
    await expectAccessible(page);
  });

  test('equipo, editor de roles e invitación', async ({ page }) => {
    await page.goto('/t/t1/team');
    await signIn(page, OWNER);
    await loaded(page);
    await expectAccessible(page);

    await page.goto('/t/t1/team/roles/catalog');
    await loaded(page);
    await expectAccessible(page);

    await page.goto('/invitation/t1/no-existe');
    await expect(page.getByRole('heading', { name: 'Te invitaron a un comercio' })).toBeVisible();
    await expectAccessible(page);
  });

  test('bitácora', async ({ page }) => {
    await page.goto('/t/t1/audit');
    await signIn(page, OWNER);
    await loaded(page);
    await expectAccessible(page);
  });

  // 002, Historia 2 (T062): el árbol de categorías, con un aviso abierto y la sección del producto.
  test('categorías: el árbol, sus avisos y la sección del producto', async ({ page }) => {
    const run = Date.now();
    const owner = await idTokenOf(OWNER);
    const create = async (name: string, parentId: string | null) => {
      const { body } = await call(owner, 'createCategory', { tenantId: 't1', requestId: crypto.randomUUID(), parentId, name });
      return (body.result as { data: { categoryId: string } }).data.categoryId;
    };
    const parent = await create(`Accesible ${run}`, null);
    const child = await create(`Hija ${run}`, parent);
    await call(owner, 'setCategoryHidden', { tenantId: 't1', categoryId: child, hidden: true });
    const { url } = await productAsOwner(`Con categorías ${run}`);

    await page.goto('/login');
    await signIn(page, OWNER);
    await page.goto('/t/t1/categories');
    await loaded(page);
    await expectAccessible(page);
    await page.getByRole('button', { name: `Acciones de «Accesible ${run}»` }).click();
    await page.getByRole('menuitem', { name: 'Ocultar', exact: true }).click();
    await expect(page.getByText('También queda oculta en la tienda su subcategoría.')).toBeVisible();
    await expectAccessible(page);

    await page.goto(url);
    await loaded(page);
    await expect(page.getByRole('heading', { name: 'Categorías', exact: true })).toBeVisible();
    await expectAccessible(page);
  });
});

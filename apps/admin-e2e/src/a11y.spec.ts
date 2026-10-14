import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { whilePressed } from './design-system-support';
import { call, idTokenOf, MULTI, OWNER, productAsOwner, productWithVariants, signIn, startsWith } from './support';

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
    await expect(page.getByRole('heading', { name: 'Iniciar sesión', exact: true })).toBeVisible();
    await expectAccessible(page);
    await page.goto('/signup');
    await expect(page.getByRole('heading', { name: 'Crear cuenta', exact: true })).toBeVisible();
    await expectAccessible(page);
  });

  test('selección de comercio y catálogo vacío', async ({ page }) => {
    await page.goto('/login');
    await signIn(page, MULTI);
    await expect(page.getByRole('heading', { name: 'Tus comercios', exact: true })).toBeVisible();
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

    await page.getByRole('button', { name: 'Nuevo producto', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Nuevo producto', exact: true })).toBeVisible();
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
    await expect(page.getByRole('heading', { name: 'Te invitaron a un comercio', exact: true })).toBeVisible();
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
    await page.getByRole('button', { name: `Acciones de «Accesible ${run}»`, exact: true }).click();
    await page.getByRole('menuitem', { name: 'Ocultar', exact: true }).click();
    await expect(page.getByText('También queda oculta en la tienda su subcategoría.', { exact: true })).toBeVisible();
    await expectAccessible(page);

    await page.goto(url);
    await loaded(page);
    await expect(page.getByRole('heading', { name: 'Categorías', exact: true })).toBeVisible();
    await expectAccessible(page);
  });

  // 002, Polish (T096): los estados que agregaron las historias después de T062.
  test('categorías: el alta, una categoría moviéndose y otra por eliminarse, con su aviso', async ({ page }) => {
    const run = Date.now();
    const owner = await idTokenOf(OWNER);
    const create = async (name: string) => {
      const { body } = await call(owner, 'createCategory', { tenantId: 't1', requestId: crypto.randomUUID(), parentId: null, name });
      return (body.result as { data: { categoryId: string } }).data.categoryId;
    };
    const moving = `Se mueve ${run}`;
    const leaving = `Se elimina ${run}`;
    await create(moving);
    const leavingId = await create(leaving);
    const { productId } = await productAsOwner(`En la que se elimina ${run}`);
    await call(owner, 'setProductCategories', { tenantId: 't1', productId, add: [leavingId], remove: [] });
    const act = async (name: string, action: string) => {
      await page.getByRole('button', { name: `Acciones de «${name}»`, exact: true }).click();
      await page.getByRole('menuitem', { name: action, exact: true }).click();
    };

    await page.goto('/login');
    await signIn(page, OWNER);
    await page.goto('/t/t1/categories');
    await loaded(page);
    await act(moving, 'Mover a…');
    await expect(page.getByRole('button', { name: 'Mover', exact: true })).toBeVisible();
    await act(leaving, 'Eliminar');
    await expect(page.getByText(startsWith(`1 producto dejará de estar en «${leaving}»`))).toBeVisible();
    await expectAccessible(page);
  });

  test('listado: filtrado por categoría, con las acciones masivas y su rechazo', async ({ page }) => {
    const run = Date.now();
    const owner = await idTokenOf(OWNER);
    const { body } = await call(owner, 'createCategory', { tenantId: 't1', requestId: crypto.randomUUID(), parentId: null, name: `Masiva ${run}` });
    const categoryId = (body.result as { data: { categoryId: string } }).data.categoryId;
    const physical = `Físico ${run}`;
    const digital = `Digital ${run}`;
    for (const name of [physical, digital]) {
      const { productId } = await productAsOwner(name);
      await call(owner, 'setProductCategories', { tenantId: 't1', productId, add: [categoryId], remove: [] });
      if (name === digital) await call(owner, 'setProductType', { tenantId: 't1', productId, version: 1, kind: 'digital' });
    }

    await page.goto('/t/t1/catalog');
    await signIn(page, OWNER);
    await loaded(page);
    await page.getByLabel('Mostrar', { exact: true }).selectOption('category');
    await page.locator('[data-field="category"]').selectOption({ label: `Masiva ${run}` });
    for (const name of [physical, digital]) await page.getByRole('checkbox', { name: `Seleccionar «${name}»`, exact: true }).check();
    await expect(page.getByText('2 seleccionados', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Activar envío gratis', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Quitar de la selección y reintentar', exact: true })).toBeVisible();
    await expectAccessible(page);
    // T058: también con un botón de la barra presionado y la onda en su pico. Antes, axe a veces la
    // encontraba a medio apagarse y la prueba fallaba al azar; ahora la mide siempre, en su peor momento.
    await whilePressed(page, page.getByRole('button', { name: 'Mostrar el precio', exact: true }), () => expectAccessible(page));
  });

  test('editor: variantes con el código de barras y el envío desplegados, un GTIN inválido y catálogos externos', async ({ page }) => {
    const url = await productWithVariants(`Accesible con variantes ${Date.now()}`);
    await call(await idTokenOf(OWNER), 'setProductShipping', {
      tenantId: 't1',
      productId: url.split('/').at(-1),
      version: 2,
      weightGrams: 300,
      dimensionsMm: { length: 300, width: 200, height: 20 },
    });

    await page.goto(url);
    await signIn(page, OWNER);
    await loaded(page);
    const row = page.getByRole('group', { name: /^Rojo \/ S/ });
    await row.getByRole('button', { name: /^Código de barras/ }).click();
    await row.getByLabel('GTIN', { exact: true }).fill('4006381333932');
    await row.getByLabel('GTIN', { exact: true }).press('Enter');
    await expect(row).toContainText('El dígito de control no corresponde');
    // El mensaje entra animado: a mitad de camino, axe mide un rojo más claro que el que queda (3,61
    // contra 5,84) y la prueba fallaba de a ratos. Se espera a que no quede ninguna animación ni
    // transición en curso, y a que el mensaje tenga su color de error definitivo.
    await expect
      .poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().endTime !== Infinity).length), { intervals: [50] })
      .toBe(0);
    // El color de error definitivo del esquema activo: el de una sonda con el mismo token que usa
    // `mat-error`. En claro es #ba1a1a, como antes; el valor fijo daba por hecho el esquema claro y fallaba
    // en el proyecto `oscuro` (T018 de la 003), y dejaría de valer cuando cambie la paleta (T021).
    const errorColor = await page.evaluate(() => {
      const probe = document.body.appendChild(document.createElement('span'));
      probe.style.color = 'var(--mat-sys-error)';
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    await expect(row.locator('mat-error')).toHaveCSS('color', errorColor);
    await expect(row).toContainText('Peso heredado del producto');
    await expect(page.getByRole('heading', { name: 'Catálogos externos', exact: true })).toBeVisible();
    await expectAccessible(page);
  });
});

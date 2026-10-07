import { expect, test, type Page } from '@playwright/test';
import { call, idTokenOf, OWNER, productAsOwner, productWithVariants, signIn } from './support';

/** El objetivo táctil mínimo de los flujos frecuentes: el de Material, 48 px, con 4 de tolerancia. */
const TOUCH = 44;

/**
 * Nada de la página sobresale a los costados: no hay desplazamiento horizontal (FR-038). Se mide
 * contra el viewport visual: con la emulación móvil, Chrome agranda el de diseño hasta el ancho del
 * contenido, y `innerWidth` crece junto con lo que desborda (hallado en la 002, Historia 2).
 */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - (window.visualViewport?.width ?? window.innerWidth));
  expect(overflow).toBe(0);
}

/**
 * Lo que se toca en los flujos de catálogo tiene al menos 44 px de alto, contando la zona táctil
 * invisible de los botones de Material y el contenedor de los campos (T095).
 */
async function expectTouchTargets(page: Page) {
  const small = await page.evaluate((minimum) => {
    const touchHeight = (element: Element) => {
      const own = element.getBoundingClientRect().height;
      // La zona táctil de Material es un elemento propio: dentro del botón, o hermano del control
      // nativo en casillas y radios.
      const control = element.closest('.mdc-checkbox, .mdc-radio, .mat-mdc-button-base') ?? element;
      const touch = control.querySelector('[class*="touch-target"]');
      const field = element.closest('.mat-mdc-text-field-wrapper');
      return Math.max(own, touch?.getBoundingClientRect().height ?? 0, field?.getBoundingClientRect().height ?? 0);
    };
    return [...document.querySelectorAll('main a, main button, main input, main select')]
      .filter((element) => element.getBoundingClientRect().width > 0 && !element.closest('p'))
      .filter((element) => touchHeight(element) < minimum)
      .map((element) => `${element.tagName.toLowerCase()} «${(element.textContent ?? '').trim().slice(0, 40)}» ${Math.round(touchHeight(element))} px`);
  }, TOUCH);
  expect(small).toEqual([]);
}

/**
 * La cruz de cada chip se puede tocar a 18 px de su centro, arriba y abajo: la zona táctil de 48 px
 * no solo mide eso, también recibe el toque (T098 de la 002). Se mide con cada una a la vista:
 * fuera de ella, `elementFromPoint` no encuentra nada.
 */
async function expectChipRemovesTappable(page: Page) {
  const missed = await page.evaluate(() =>
    [...document.querySelectorAll('main .mat-mdc-chip-remove')].flatMap((button) => {
      button.scrollIntoView({ block: 'center' });
      const r = button.getBoundingClientRect();
      const reaches = (y: number) => document.elementFromPoint(r.left + r.width / 2, y)?.closest('.mat-mdc-chip-remove') === button;
      const center = r.top + r.height / 2;
      return reaches(center - 18) && reaches(center + 18) ? [] : [button.getAttribute('aria-label')];
    }),
  );
  expect(missed).toEqual([]);
}

// T092 y T095 — FR-038: los flujos de catálogo, a 360 px, sin desplazamiento horizontal y con
// objetivos táctiles cómodos para una mano.
test.describe('en el teléfono', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) > 400, 'solo en la pantalla angosta');

  test('el catálogo y la tabla de variantes caben y se editan sin salir de ella', async ({ page }) => {
    const url = await productWithVariants(`Remera móvil ${Date.now()}`);
    await page.goto('/t/t1/catalog');
    await signIn(page, OWNER);
    await expect(page.locator('ui-skeleton')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page);

    await page.goto(url);
    const row = page.getByRole('group', { name: /^Rojo \/ S/ });
    await expect(row).toBeVisible();
    await expect(page.getByRole('group', { name: /^Azul \/ M/ })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page);

    // Cada campo de la fila entra entero en la pantalla.
    for (const field of await row.locator('input').all()) {
      const box = await field.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= 360).toBe(true);
    }

    await row.getByLabel(/^Precio \(/).fill('45000');
    await row.getByLabel(/^Precio \(/).press('Enter');
    await row.getByLabel('Existencias').fill('12');
    await row.getByLabel('Existencias').press('Enter');
    await expect(row.getByLabel(/^Precio \(/)).toHaveValue('45.000');
    await expect(row.getByLabel('Existencias')).toHaveValue('12');

    // La edición masiva queda a mano, abajo, sin tapar la fila elegida ni sobresalir.
    await page.getByRole('checkbox', { name: 'Seleccionar todas las variantes' }).check();
    const bar = page.locator('app-bulk-edit');
    await expect(bar).toBeInViewport();
    await expectNoHorizontalScroll(page);
  });

  test('equipo y bitácora caben sin desplazamiento horizontal', async ({ page }) => {
    await page.goto('/t/t1/team');
    await signIn(page, OWNER);
    await expect(page.locator('ui-skeleton')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await page.goto('/t/t1/audit');
    await expect(page.locator('ui-skeleton')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  // 002, Historia 2 (T062): el árbol, con sus tres niveles, cabe a 360 px y se toca con una mano.
  test('las categorías caben sin desplazamiento horizontal', async ({ page }) => {
    const run = Date.now();
    const owner = await idTokenOf(OWNER);
    let parentId: string | null = null;
    // Nombres largos: el selector de dónde crear toma el ancho de la ruta más larga si no se lo acota.
    for (const name of [`Primer nivel con un nombre largo ${run}`, `Segundo nivel con otro nombre largo ${run}`, `Tercer nivel ${run}`]) {
      const { body } = await call(owner, 'createCategory', { tenantId: 't1', requestId: crypto.randomUUID(), parentId, name });
      parentId = (body.result as { data: { categoryId: string } }).data.categoryId;
    }
    await page.goto('/t/t1/categories');
    await signIn(page, OWNER);
    await expect(page.locator('ui-skeleton')).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page);
  });

  test('la sección de categorías del producto cabe con rutas largas', async ({ page }) => {
    const run = Date.now();
    const owner = await idTokenOf(OWNER);
    let parentId: string | null = null;
    for (const name of [`Una categoría de nombre largo ${run}`, `Otra subcategoría de nombre largo ${run}`, `Y la última ${run}`]) {
      const { body } = await call(owner, 'createCategory', { tenantId: 't1', requestId: crypto.randomUUID(), parentId, name });
      parentId = (body.result as { data: { categoryId: string } }).data.categoryId;
    }
    const url = await productWithVariants(`Remera con categorías ${run}`);
    await page.goto(url);
    await signIn(page, OWNER);
    await expect(page.getByRole('heading', { name: 'Categorías', exact: true })).toBeVisible();
    // Se mide con el árbol ya cargado: el ancho lo pone la ruta más larga del selector.
    await expect(page.locator('[data-field="addCategory"] option', { hasText: `Y la última ${run}` })).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page);
  });

  // 002, Polish (T098): lo que agregaron las historias después de T062.
  test('el editor con lo de la 002 desplegado y textos largos sin espacios', async ({ page }) => {
    const run = Date.now();
    const url = await productWithVariants(`Remera completa ${run}`);
    const productId = url.split('/').at(-1);
    const owner = await idTokenOf(OWNER);
    const ok = (result: { body: { result?: unknown } }) => expect(result.body.result).toEqual(expect.objectContaining({ ok: true }));
    ok(await call(owner, 'setProductShipping', { tenantId: 't1', productId, version: 2, weightGrams: 300, dimensionsMm: { length: 300, width: 200, height: 20 } }));
    // Lo que no tiene espacios no se corta solo: una URL, una etiqueta y un MPN largos.
    ok(await call(owner, 'setProductSlug', { tenantId: 't1', productId, version: 3, slug: `una-url-amigable-bastante-larga-y-sin-espacios-para-cortar-${run}` }));
    ok(
      await call(owner, 'updateProductDetails', {
        tenantId: 't1',
        productId,
        version: 4,
        tags: [`etiquetalarguisimasinespacios${run}`.slice(0, 40)],
        brand: `Una marca con un nombre bastante largo ${run}`,
        mpn: `MPN-${'0123456789'.repeat(6)}`,
      }),
    );
    const { body } = await call(owner, 'createCategory', { tenantId: 't1', requestId: crypto.randomUUID(), parentId: null, name: `Con chip ${run}` });
    const categoryId = (body.result as { data: { categoryId: string } }).data.categoryId;
    ok(await call(owner, 'setProductCategories', { tenantId: 't1', productId, add: [categoryId], remove: [] }));

    await page.goto(url);
    await signIn(page, OWNER);
    await expect(page.locator('ui-skeleton')).toHaveCount(0);
    for (const name of [/^Rojo \/ S/, /^Azul \/ M/]) {
      await page.getByRole('group', { name }).getByRole('button', { name: /^Código de barras/ }).click();
    }
    const row = page.getByRole('group', { name: /^Rojo \/ S/ });
    await row.getByLabel('GTIN', { exact: true }).fill('4006381333932');
    await row.getByLabel('GTIN', { exact: true }).press('Enter');
    await expect(row).toContainText('El dígito de control no corresponde');
    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page);
    await expect(page.locator('main .mat-mdc-chip-remove')).toHaveCount(2);
    await expectChipRemovesTappable(page);
  });

  test('el listado con las acciones masivas y su rechazo, y el árbol en edición', async ({ page }) => {
    const run = Date.now();
    const owner = await idTokenOf(OWNER);
    const category = async (name: string) => {
      const { body } = await call(owner, 'createCategory', { tenantId: 't1', requestId: crypto.randomUUID(), parentId: null, name });
      return (body.result as { data: { categoryId: string } }).data.categoryId;
    };
    const moving = `Una categoría que se mueve con nombre largo ${run}`;
    const leaving = `Una categoría que se elimina con nombre largo ${run}`;
    await category(moving);
    const leavingId = await category(leaving);
    const names = [`Físico con un nombre largo ${run}`, `Digital con un nombre largo ${run}`];
    for (const name of names) {
      const { productId } = await productAsOwner(name);
      await call(owner, 'setProductCategories', { tenantId: 't1', productId, add: [leavingId], remove: [] });
      if (name.startsWith('Digital')) await call(owner, 'setProductType', { tenantId: 't1', productId, version: 1, kind: 'digital' });
    }

    await page.goto('/t/t1/catalog');
    await signIn(page, OWNER);
    await expect(page.locator('ui-skeleton')).toHaveCount(0);
    await page.getByLabel('Mostrar').selectOption('category');
    await page.locator('[data-field="category"]').selectOption({ label: leaving });
    for (const name of names) await page.getByRole('checkbox', { name: `Seleccionar «${name}»` }).check();
    await page.getByRole('button', { name: 'Activar envío gratis' }).click();
    await expect(page.getByRole('button', { name: 'Quitar de la selección y reintentar' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page);

    await page.goto('/t/t1/categories');
    await expect(page.locator('ui-skeleton')).toHaveCount(0);
    for (const [name, action] of [[moving, 'Mover a…'], [leaving, 'Eliminar']] as const) {
      await page.getByRole('button', { name: `Acciones de «${name}»` }).click();
      await page.getByRole('menuitem', { name: action, exact: true }).click();
    }
    await expect(page.getByText(`2 productos dejarán de estar en «${leaving}»`)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectTouchTargets(page);
  });
});

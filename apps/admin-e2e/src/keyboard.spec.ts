import { expect, test, type Page } from '@playwright/test';
import { call, idTokenOf, OWNER, productWithVariants, signIn } from './support';

// T093 — FR-038a: la tabla de variantes se opera entera con el teclado, y cada cambio de estado se
// anuncia a quien usa lector de pantalla con el LiveAnnouncer del CDK.
test.describe('con el teclado', () => {
  test.skip(({ isMobile }) => isMobile, 'el recorrido con teclado se prueba en escritorio');

  test('editar en línea, seleccionar, aplicar en lote y abrir imágenes, sin mouse', async ({ page }) => {
    const url = await productWithVariants(`Teclado ${Date.now()}`);
    await page.goto(url);
    await signIn(page, OWNER);
    const announced = page.locator('.cdk-live-announcer-element');
    const first = page.getByRole('group', { name: /^Rojo \/ S/ });
    const last = page.getByRole('group', { name: /^Azul \/ M/ });
    await expect(first).toBeVisible();

    await test.step('cada campo se guarda con Enter y se anuncia; Tab pasa al siguiente', async () => {
      await first.getByLabel('SKU').focus();
      // El SKU es único en el comercio: uno nuevo por corrida.
      await page.keyboard.type(`TEC-${Date.now()}`);
      await page.keyboard.press('Enter');
      await expect(announced).toHaveText('SKU de Rojo / S guardado');
      await page.keyboard.press('Tab');
      await expect(first.getByLabel(/^Precio \(/)).toBeFocused();
      await page.keyboard.type('45000');
      await page.keyboard.press('Enter');
      await expect(announced).toHaveText('Precio de Rojo / S guardado');
    });

    await test.step('un valor mal escrito se anuncia como error, sin perder lo escrito', async () => {
      await page.keyboard.press('Tab');
      await expect(first.getByLabel(/^Precio tachado/)).toBeFocused();
      await page.keyboard.type('abc');
      await page.keyboard.press('Enter');
      await expect(first.getByLabel(/^Precio tachado/)).toHaveValue('abc');
      await expect(first.getByLabel(/^Precio tachado/)).toHaveAttribute('aria-invalid', 'true');
      await expect(announced).toHaveText(/^Precio tachado de Rojo \/ S: /);
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
    });

    await test.step('la casilla se marca con Espacio y la barra de edición en lote sigue a la última fila', async () => {
      await first.getByRole('checkbox', { name: 'Seleccionar Rojo / S' }).focus();
      await page.keyboard.press('Space');
      await expect(page.getByText('1 variante seleccionada')).toBeVisible();
      await last.getByLabel('Existencias').focus();
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('Campo')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('Valor para todas')).toBeFocused();
      await page.keyboard.type('50000');
      await page.keyboard.press('Enter');
      await expect(announced).toHaveText('Precio aplicado a 1 variante');
    });

    await test.step('las imágenes se abren con Enter, y Escape devuelve el foco al botón', async () => {
      const images = first.getByRole('button', { name: /^Imágenes de Rojo \/ S/ });
      await images.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(images).toBeFocused();
    });
  });

  // 002, Polish (T099) — WCAG 2.5.7: arrastrar en el árbol tiene alternativa sin arrastre, y se usa
  // entera con el teclado; cada cambio se anuncia, y el foco se queda con la categoría que se movió.
  test('mover y reordenar categorías sin arrastrar, solo con el teclado', async ({ page }) => {
    const run = Date.now();
    const owner = await idTokenOf(OWNER);
    const create = async (name: string, parentId: string | null = null) => {
      const { body } = await call(owner, 'createCategory', { tenantId: 't1', requestId: crypto.randomUUID(), parentId, name });
      return (body.result as { data: { categoryId: string } }).data.categoryId;
    };
    // El destino se elige escribiendo su nombre: sin acentos, que el teclado emulado no escribe como teclas.
    const [parent, first, second, other] = [`Padre ${run}`, `Primera ${run}`, `Segunda ${run}`, `Destino ${run}`];
    const parentId = await create(parent);
    await create(first, parentId);
    await create(second, parentId);
    await create(other);

    await page.goto('/login');
    await signIn(page, OWNER);
    await page.goto('/t/t1/categories');
    const announced = page.locator('.cdk-live-announcer-element');
    const actions = (name: string) => page.getByRole('button', { name: `Acciones de «${name}»` });
    const children = page.locator('li[data-category]').filter({ hasText: parent }).locator('li[data-category] .category-name');
    await expect(actions(second)).toBeVisible();

    await test.step('reordenar: «Segunda» sube al primer lugar, se anuncia y el foco se queda con ella', async () => {
      await actions(second).focus();
      await page.keyboard.press('Enter');
      await chooseInMenu(page, 'Subir');
      await expect(announced).toHaveText(`«${second}» quedó en el lugar 1 de «${parent}».`);
      await expect(children).toHaveText([second, first]);
      await expect(actions(second)).toBeFocused();
    });

    await test.step('mover: «Primera» pasa a otra raíz desde el formulario, se anuncia y el foco se queda con ella', async () => {
      await actions(first).focus();
      await page.keyboard.press('Enter');
      await chooseInMenu(page, 'Mover a…');
      // El menú devuelve el foco al botón de acciones, y el formulario aparece justo después.
      const destination = page.locator('select[data-field="destination"]');
      await expect(actions(first)).toBeFocused();
      await expect(destination).toBeVisible();
      await page.keyboard.press('Tab');
      await expect(destination).toBeFocused();
      // Escribir el nombre elige esa opción, también con la lista cerrada; las flechas, en macOS, la abren.
      await page.keyboard.type(other);
      await expect.poll(() => destination.evaluate((select: HTMLSelectElement) => select.selectedOptions[0]?.text)).toBe(other);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Mover', exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(announced).toHaveText(`«${first}» quedó dentro de «${other}».`);
      await expect(page.locator('li[data-category]').filter({ hasText: other }).locator('li[data-category] .category-name')).toHaveText([first]);
      await expect(actions(first)).toBeFocused();
    });
  });
});

/** Con un menú abierto, baja con las flechas hasta la opción y la elige con Enter. */
async function chooseInMenu(page: Page, item: string) {
  const menu = page.getByRole('menu');
  // Abierto con el teclado, el menú pasa el foco a su primera opción.
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  const target = menu.getByRole('menuitem', { name: item, exact: true });
  for (let i = 0; i < 10 && !(await target.evaluate((element) => element === document.activeElement)); i++) await page.keyboard.press('ArrowDown');
  await expect(target).toBeFocused();
  await page.keyboard.press('Enter');
}

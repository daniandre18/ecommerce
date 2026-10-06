import { expect, test, type Locator, type Page } from '@playwright/test';
import { OWNER, productAsOwner, signIn } from './support';

// T094 — FR-039: el trabajo en curso no se pierde en silencio, y lo que falló se puede reintentar.
test.describe('trabajo en curso', () => {
  test('si el guardado falla por la red, lo escrito queda y se reintenta tal cual', async ({ page }) => {
    const { url } = await productAsOwner(`Sin red ${Date.now()}`);
    await page.goto(url);
    await signIn(page, OWNER);
    const price = page.getByRole('group', { name: /^Única/ }).getByLabel(/^Precio \(/);

    await page.route(/\/setVariantPrice$/, (route) => route.abort('internetdisconnected'));
    await price.fill('38000');
    await price.press('Enter');
    await expect(page.getByRole('group', { name: /^Única/ })).toContainText('Reintentá');
    await expect(price).toHaveValue('38000');

    await page.unroute(/\/setVariantPrice$/);
    await price.press('Enter');
    await expect(price).toHaveValue('38.000');
    await expect(page.locator('.cdk-live-announcer-element')).toHaveText('Precio de Única guardado');
  });

  test('salir con cambios sin guardar pregunta antes, y quedarse los conserva', async ({ page }) => {
    const { url } = await productAsOwner(`Sin guardar ${Date.now()}`);
    await page.goto(url);
    await signIn(page, OWNER);
    const name = page.getByLabel('Nombre', { exact: true });
    await name.fill('Nombre a medio escribir');

    await page.getByRole('link', { name: '← Catálogo' }).click();
    const dialog = page.getByRole('dialog', { name: 'Hay cambios sin guardar' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page).toHaveURL(url);
    await expect(name).toHaveValue('Nombre a medio escribir');

    await page.getByRole('link', { name: '← Catálogo' }).click();
    await page.getByRole('dialog', { name: 'Hay cambios sin guardar' }).getByRole('button', { name: 'Salir sin guardar' }).click();
    await expect(page).toHaveURL(/\/t\/t1\/catalog$/);
  });
});

/** Intenta salir por `leave`: se pregunta antes, y quedarse conserva lo escrito en `field`. */
async function asksBeforeLeaving(page: Page, leave: Locator, field: Locator, written: string) {
  await leave.click();
  const dialog = page.getByRole('dialog', { name: 'Hay cambios sin guardar' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(field).toHaveValue(written);
}

// 002, Polish (T097a) — FR-039 de la 001 en las vistas nuevas: el editor del árbol y las secciones
// nuevas del editor de producto.
test.describe('trabajo en curso en las vistas de la 002', () => {
  test('salir del árbol con una categoría a medio escribir pregunta antes', async ({ page }) => {
    await page.goto('/login');
    await signIn(page, OWNER);
    await page.goto('/t/t1/categories');
    const name = page.locator('[data-field="newName"]');
    await name.fill('Categoría a medio escribir');
    const catalog = page.getByRole('link', { name: 'Catálogo', exact: true });
    await asksBeforeLeaving(page, catalog, name, 'Categoría a medio escribir');
    await expect(page).toHaveURL(/\/t\/t1\/categories$/);

    await catalog.click();
    await page.getByRole('dialog', { name: 'Hay cambios sin guardar' }).getByRole('button', { name: 'Salir sin guardar' }).click();
    await expect(page).toHaveURL(/\/t\/t1\/catalog$/);
  });

  test('salir del editor con algo sin guardar en una sección nueva pregunta antes', async ({ page }) => {
    const { url } = await productAsOwner(`Secciones sin guardar ${Date.now()}`);
    await page.goto(url);
    await signIn(page, OWNER);
    const back = page.getByRole('link', { name: '← Catálogo' });
    const variant = page.getByRole('group', { name: /^Única/ });
    await variant.getByRole('button', { name: /^Código de barras/ }).click();
    const sections: [string, Locator, string][] = [
      ['En la tienda', page.getByLabel('Título para buscadores'), 'Título a medio escribir'],
      ['Envío', page.getByLabel('Peso', { exact: true }), '0,5'],
      ['Catálogos externos', page.getByLabel('MPN (código del fabricante)'), 'MPN-123'],
      // Inválido, no se guarda al salir del campo: queda escrito y sin guardar.
      ['Código de barras de la variante', variant.getByLabel('GTIN', { exact: true }), '4006381333932'],
    ];
    for (const [section, field, written] of sections) {
      await test.step(section, async () => {
        await field.fill(written);
        await asksBeforeLeaving(page, back, field, written);
        await expect(page).toHaveURL(url);
        await field.fill('');
      });
    }
  });

  test('una falla de red al guardar la ficha de tienda no pierde lo escrito, y se reintenta', async ({ page }) => {
    const { url } = await productAsOwner(`Ficha sin red ${Date.now()}`);
    await page.goto(url);
    await signIn(page, OWNER);
    const title = page.getByLabel('Título para buscadores');

    await page.route(/\/updateProductDetails$/, (route) => route.abort('internetdisconnected'));
    await title.fill('Título que no se pierde');
    await page.getByRole('button', { name: 'Guardar ficha' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /reintent/i })).toBeVisible();
    await expect(title).toHaveValue('Título que no se pierde');

    await page.unroute(/\/updateProductDetails$/);
    await page.getByRole('button', { name: 'Guardar ficha' }).click();
    await expect(page.getByText('Ficha de tienda guardada')).toBeVisible();
    await expect(title).toHaveValue('Título que no se pierde');
  });

  test('una falla de red al crear una categoría no pierde lo escrito, y se reintenta', async ({ page }) => {
    const name = `Sin red ${Date.now()}`;
    await page.goto('/login');
    await signIn(page, OWNER);
    await page.goto('/t/t1/categories');
    const field = page.locator('[data-field="newName"]');

    await page.route(/\/createCategory$/, (route) => route.abort('internetdisconnected'));
    await field.fill(name);
    await page.getByRole('button', { name: 'Crear categoría' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /reintent/i })).toBeVisible();
    await expect(field).toHaveValue(name);

    await page.unroute(/\/createCategory$/);
    await page.getByRole('button', { name: 'Crear categoría' }).click();
    await expect(page.getByRole('button', { name: `Acciones de «${name}»` })).toBeVisible();
  });
});

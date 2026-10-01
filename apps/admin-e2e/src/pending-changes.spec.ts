import { expect, test } from '@playwright/test';
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

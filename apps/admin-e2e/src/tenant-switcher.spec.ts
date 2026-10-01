import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill('test-1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
}

// T075 y quickstart.md, "Cuentas en varios comercios" (FR-005): el comercio activo es la ruta.
test.describe('los comercios de la cuenta', () => {
  test('con un solo comercio, al entrar va directo a su catálogo', async ({ page }) => {
    await signIn(page, 'owner@t1.test');
    await expect(page).toHaveURL(/\/t\/t1\/catalog$/);
    await expect(page.locator('header')).toContainText('Comercio Uno');
    await page.getByRole('button', { name: 'Cuenta' }).click();
    await expect(page.getByRole('menuitem', { name: 'Cerrar sesión' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Cambiar de comercio' })).toHaveCount(0);
  });

  test('con varios, elige de la lista y cambia desde el encabezado', async ({ page }) => {
    await signIn(page, 'multi@test');
    await expect(page.getByRole('heading', { name: 'Tus comercios' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Comercio Dos/ })).toContainText('Propietario');
    await expect(page.getByRole('link', { name: /Comercio Uno/ })).toContainText('Colaboración');

    await page.getByRole('link', { name: /Comercio Dos/ }).click();
    await expect(page).toHaveURL(/\/t\/t2\/catalog$/);
    await expect(page.locator('header')).toContainText('Comercio Dos');

    await page.getByRole('button', { name: 'Cuenta' }).click();
    await page.getByRole('menuitem', { name: 'Cambiar de comercio' }).click();
    await page.getByRole('link', { name: /Comercio Uno/ }).click();
    await expect(page).toHaveURL(/\/t\/t1\/catalog$/);
    await expect(page.locator('header')).toContainText('Comercio Uno');
  });
});

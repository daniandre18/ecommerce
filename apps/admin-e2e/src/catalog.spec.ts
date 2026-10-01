import { expect, test, type Page } from '@playwright/test';

const OWNER = { email: 'owner@t1.test', password: 'test-1234' };

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.getByLabel('Correo').fill(account.email);
  await page.getByLabel('Contraseña').fill(account.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

// Recorrido de la Historia 1 contra los emuladores (quickstart.md). Crece con cada entrega de la
// interfaz hasta cubrir los pasos 1 a 9 (T061).
test.describe('catálogo', () => {
  test('paso 1: entra con su cuenta y vuelve a la página que había pedido', async ({ page }) => {
    await page.goto('/t/t1/catalog');
    await expect(page).toHaveURL(/\/login\?returnUrl=/);

    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/t\/t1\/catalog$/);
    await expect(page.getByRole('heading', { name: 'Catálogo' })).toBeVisible();
    await expect(page.locator('header')).toContainText('Comercio Uno');
  });

  test('una contraseña equivocada no entra, y no dice cuál de los dos datos falló', async ({ page }) => {
    await page.goto('/login');
    await signIn(page, { ...OWNER, password: 'otra-cosa' });
    await expect(page.getByRole('alert')).toContainText('El correo o la contraseña no son correctos');
    await expect(page).toHaveURL(/\/login/);
  });

  // La creación pasa por la callable, con App Check y la guarda, y vuelve por la lectura en tiempo real.
  test('paso 2: crea un producto, abre su editor, y en el listado aparece en borrador con su variante implícita', async ({ page }) => {
    await page.goto('/t/t1/catalog');
    await signIn(page, OWNER);

    const name = `Camiseta ${test.info().project.name} ${Date.now()}`;
    await page.getByRole('button', { name: 'Nuevo producto' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo producto' });
    await dialog.getByLabel('Nombre').fill(name);
    await dialog.getByRole('button', { name: 'Crear' }).click();
    await expect(dialog).toBeHidden();

    // Lo siguiente con un producto nuevo es armar sus variantes: se abre su editor.
    await expect(page).toHaveURL(/\/t\/t1\/catalog\/[^/]+$/);
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await page.getByRole('link', { name: '← Catálogo' }).click();

    const row = page.getByRole('listitem').filter({ hasText: name });
    await expect(row).toContainText('Borrador · 1 variante');
    await expect(row).toContainText('Variantes sin SKU');

    await page.getByLabel('Buscar por nombre').fill(name.toLowerCase());
    await expect(page.getByRole('listitem')).toHaveCount(1);
  });

  // Sin membresía, las reglas niegan la lectura exista o no el comercio: el panel no los distingue.
  test('en un comercio ajeno no ve nada, y el mensaje no revela si existe', async ({ page }) => {
    await page.goto('/t/t2/catalog');
    await signIn(page, OWNER);
    await expect(page.getByRole('alert').first()).toContainText('Puede que no exista o que no tengas acceso');
    await expect(page.getByRole('listitem')).toHaveCount(0);
  });

  test('a 360 px no hay desplazamiento horizontal en el catálogo (FR-038)', async ({ page }) => {
    await page.goto('/t/t1/catalog');
    await signIn(page, OWNER);
    await expect(page.getByRole('heading', { name: 'Catálogo' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });
});

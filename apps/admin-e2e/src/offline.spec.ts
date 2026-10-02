import { expect, test } from '@playwright/test';
import { OWNER, productAsOwner, signIn } from './support';

// T098 — quickstart, Historia 4, paso 3 (FR-037): sin red, la falta de datos se presenta como un
// error con reintento, nunca como un vacío; y al volver la red, todo se recupera.
test.describe('sin conexión', () => {
  test('un producto abierto sin red da error en vez de "0 variantes", y se recupera con la red', async ({ page, context }) => {
    const first = await productAsOwner(`Con red ${Date.now()}`);
    const second = await productAsOwner(`Sin red ${Date.now()}`);
    await page.goto(first.url);
    await signIn(page, OWNER);
    await expect(page.getByRole('group', { name: /^Única/ })).toBeVisible();

    await context.setOffline(true);
    await page.evaluate((url) => history.pushState({}, '', url), second.url);
    await page.evaluate(() => dispatchEvent(new PopStateEvent('popstate')));
    await expect(page.getByText(/^No pudimos cargar/).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Variantes (0)')).toHaveCount(0);

    await context.setOffline(false);
    await expect(page.getByRole('heading', { level: 1, name: /^Sin red/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('group', { name: /^Única/ })).toBeVisible();
  });

  test('una vista que no se puede descargar lo avisa, y se reintenta', async ({ page, context }) => {
    await page.goto('/login');
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/t\/t1\/catalog$/);
    // El enlace aparece cuando llega el acceso de la cuenta: cortar la red antes dejaría sin él.
    const audit = page.getByRole('link', { name: 'Bitácora' });
    await expect(audit).toBeVisible();

    await context.setOffline(true);
    await audit.click();
    const notice = page.getByRole('alert').filter({ hasText: 'No pudimos abrir esa vista' });
    await expect(notice).toBeVisible();

    await context.setOffline(false);
    await notice.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page).toHaveURL(/\/t\/t1\/audit$/);
    await expect(notice).toHaveCount(0);
  });
});

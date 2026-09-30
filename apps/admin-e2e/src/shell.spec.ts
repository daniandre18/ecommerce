import { expect, test } from '@playwright/test';

// El shell del panel, con teclado y navegador reales (FR-038, FR-038a).
test.describe('shell del panel', () => {
  test('el documento declara el idioma para los lectores de pantalla (WCAG 3.1.1)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  });

  test('el primer Tab muestra el enlace para saltar al contenido, y Enter lleva el foco al contenido (WCAG 2.4.1)', async ({ page }) => {
    await page.goto('/');

    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Saltar al contenido' });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeInViewport();

    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
  });

  test('no hay desplazamiento horizontal (FR-038)', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });
});

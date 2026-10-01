import { expect, test } from '@playwright/test';
import { OWNER, productWithVariants, signIn } from './support';

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
});

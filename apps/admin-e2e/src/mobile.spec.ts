import { expect, test, type Page } from '@playwright/test';
import { OWNER, productWithVariants, signIn } from './support';

/** El objetivo táctil mínimo de los flujos frecuentes: el de Material, 48 px, con 4 de tolerancia. */
const TOUCH = 44;

/** Nada de la página sobresale a los costados: no hay desplazamiento horizontal (FR-038). */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
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
});

import { expect, test, type Locator, type Page } from '@playwright/test';

const OWNER = { email: 'owner@t1.test', password: 'test-1234' };

async function signIn(page: Page) {
  await page.getByLabel('Correo').fill(OWNER.email);
  await page.getByLabel('Contraseña').fill(OWNER.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

async function createProduct(page: Page, name: string) {
  await page.goto('/t/t1/catalog');
  await signIn(page);
  await page.getByRole('button', { name: 'Nuevo producto' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo producto' });
  await dialog.getByLabel('Nombre').fill(name);
  await dialog.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

/** Agrega una opción con sus valores, de a uno, como lo hace una persona. */
async function addOption(page: Page, name: string, values: string[]) {
  await page.getByRole('button', { name: 'Agregar opción' }).click();
  const option = page.getByRole('group', { name: 'Opción nueva' });
  await option.getByLabel('Nombre de la opción', { exact: true }).fill(name);
  const filled = page.getByRole('group', { name, exact: true });
  for (const [index, value] of values.entries()) {
    if (index > 0) await filled.getByRole('button', { name: `Agregar valor a «${name}»` }).click();
    await filled.getByLabel(`Valor ${index + 1}`, { exact: true }).fill(value);
  }
}

const variant = (page: Page, label: string) => page.getByRole('group', { name: new RegExp(`^${label.replace('/', '\\/')}( |$)`) });

/** Escribe y sale del campo: la tabla guarda cada campo al perder el foco. */
async function enter(row: Locator, field: RegExp, value: string) {
  const input = row.getByLabel(field);
  await input.fill(value);
  await input.press('Tab');
}

// Historia 1, pasos 2 a 5 y 7 de quickstart.md: el editor de variantes de punta a punta.
test('las variantes se arman de a una opción y lo cargado no se pierde (FR-017, FR-018, FR-024, FR-029)', async ({ page }) => {
  const run = `${test.info().project.name}-${Date.now()}`;
  await createProduct(page, `Remera ${run}`);

  await test.step('2. sin opciones, una variante implícita', async () => {
    await expect(page.getByRole('heading', { name: 'Variantes (1)' })).toBeVisible();
    await expect(variant(page, 'Única')).toContainText('Falta el SKU');
  });

  await test.step('3. la opción color con Rojo y Amarillo da dos filas al instante', async () => {
    await addOption(page, 'Color', ['Rojo', 'Amarillo']);
    await expect(page.getByText('2 combinaciones')).toBeVisible();
    await page.getByRole('button', { name: 'Guardar opciones' }).click();
    await expect(page.getByRole('heading', { name: 'Variantes (2)' })).toBeVisible();
  });

  await test.step('4. SKU, precio y existencias en ambas', async () => {
    for (const [label, price, stock] of [
      ['Rojo', '10', '3'],
      ['Amarillo', '12,5', '0'],
    ] as const) {
      const row = variant(page, label);
      await enter(row, /^SKU/, `${label}-${run}`);
      await enter(row, /^Precio \(/, price);
      await enter(row, /^Existencias/, stock);
      await expect(row).not.toContainText('Falta el SKU');
    }
  });

  await test.step('5. la talla S y M pide asignar las existentes, que conservan todo; las nuevas, sin definir', async () => {
    await addOption(page, 'Talla', ['S', 'M']);
    await page.getByRole('button', { name: 'Guardar opciones' }).click();
    const dialog = page.getByRole('dialog', { name: '¿Qué valor tiene cada variante?' });
    await dialog.getByLabel('Talla: aplicar a todas').selectOption({ label: 'S' });
    await dialog.getByRole('button', { name: 'Confirmar' }).click();

    await expect(page.getByRole('heading', { name: 'Variantes (4)' })).toBeVisible();
    const kept = variant(page, 'Rojo / S');
    await expect(kept.getByLabel(/^SKU/)).toHaveValue(`Rojo-${run}`);
    await expect(kept.getByLabel(/^Precio \(/)).toHaveValue('10,00');
    await expect(kept.getByLabel(/^Existencias/)).toHaveValue('3');

    const created = variant(page, 'Rojo / M');
    await expect(created).toContainText('Falta el SKU');
    await expect(created.getByLabel(/^Existencias/)).toHaveValue('');
    await expect(created.getByLabel(/^Existencias/)).toHaveAttribute('placeholder', 'Sin definir');
  });

  await test.step('7. un SKU que ya usa otra variante se rechaza señalando cuál', async () => {
    const row = variant(page, 'Rojo / M');
    await enter(row, /^SKU/, `rojo-${run}`);
    await expect(row).toContainText('Ese SKU ya lo usa la variante Rojo / S');
  });
});

// Paso 9 (FR-025): los topes se avisan antes de enviar y no se crea nada.
test('topes: hasta 5 opciones y 100 combinaciones, sin crear nada', async ({ page }) => {
  await createProduct(page, `Topes ${test.info().project.name}-${Date.now()}`);
  const values = (n: number) => Array.from({ length: n }, (_, i) => `v${i + 1}`);

  await addOption(page, 'A', values(11));
  await addOption(page, 'B', values(10));
  await expect(page.getByText('110 combinaciones — supera el máximo')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar opciones' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'producirían 110 combinaciones' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Variantes (1)' })).toBeVisible();

  for (const name of ['C', 'D', 'E']) await addOption(page, name, ['x']);
  await expect(page.getByRole('button', { name: 'Agregar opción' })).toBeDisabled();
});

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

// Historia 1, pasos 2 a 8 de quickstart.md: el editor de variantes de punta a punta.
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
    for (const [label, price, saved, stock] of [
      ['Rojo', '45000', '45.000', '3'],
      ['Amarillo', '52.500', '52.500', '0'],
    ] as const) {
      const row = variant(page, label);
      await enter(row, /^SKU/, `${label}-${run}`);
      await enter(row, /^Precio \(/, price);
      await enter(row, /^Existencias/, stock);
      // Guardado y confirmado: el importe vuelve en su forma canónica.
      await expect(row).not.toContainText('Falta el SKU');
      await expect(row.getByLabel(/^Precio \(/)).toHaveValue(saved);
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
    await expect(kept.getByLabel(/^Precio \(/)).toHaveValue('45.000');
    await expect(kept.getByLabel(/^Existencias/)).toHaveValue('3');

    const created = variant(page, 'Rojo / M');
    await expect(created).toContainText('Falta el SKU');
    await expect(created.getByLabel(/^Existencias/)).toHaveValue('');
    await expect(created.getByLabel(/^Existencias/)).toHaveAttribute('placeholder', 'Sin definir');
  });

  await test.step('6. activar con variantes sin SKU se impide diciendo cuáles; completas, se activa', async () => {
    const status = page.getByRole('radiogroup', { name: 'Estado' });
    await status.getByRole('radio', { name: /^Activo/ }).check();
    const blocked = page.getByRole('alert').filter({ hasText: 'completá el SKU de' });
    await expect(blocked).toContainText('Rojo / M');
    await expect(blocked).toContainText('Amarillo / M');
    await expect(page.getByRole('button', { name: 'Cambiar estado' })).toBeDisabled();

    for (const label of ['Rojo / M', 'Amarillo / M']) {
      await enter(variant(page, label), /^SKU/, `${label.replace(' / ', '-')}-${run}`);
      await expect(variant(page, label)).not.toContainText('Falta el SKU');
    }
    await expect(blocked).toBeHidden();
    await page.getByRole('button', { name: 'Cambiar estado' }).click();
    await expect(page.locator('app-product-editor p.status')).toHaveText('Activo');

    await status.getByRole('radio', { name: /^No listado/ }).check();
    await page.getByRole('button', { name: 'Cambiar estado' }).click();
    await expect(page.locator('app-product-editor p.status')).toHaveText('No listado');
  });

  await test.step('7. un SKU que ya usa otra variante se rechaza señalando cuál', async () => {
    const row = variant(page, 'Rojo / M');
    await enter(row, /^SKU/, `rojo-${run}`);
    await expect(row).toContainText('Ese SKU ya lo usa la variante Rojo / S');
  });

  await test.step('8. el mismo precio a todas en una acción, con una entrada de bitácora por variante', async () => {
    await page.getByRole('checkbox', { name: 'Seleccionar todas las variantes' }).check();
    const bulk = page.locator('app-bulk-edit');
    await expect(bulk).toContainText('4 variantes seleccionadas');
    await bulk.getByLabel('Campo').selectOption('price');
    await bulk.getByLabel('Valor para todas').fill('60.000');
    await bulk.getByRole('button', { name: 'Aplicar a 4 variantes' }).click();

    for (const label of ['Rojo / S', 'Rojo / M', 'Amarillo / S', 'Amarillo / M']) {
      await expect(variant(page, label).getByLabel(/^Precio \(/)).toHaveValue('60.000');
    }
    const productId = page.url().split('/').at(-1) ?? '';
    const batches = await priceBatches(productId);
    expect([...batches.values()].filter((entries) => entries === 4)).toHaveLength(1);
  });
});

/**
 * Entradas de bitácora de cambios de precio de un producto, agrupadas por lote. Se leen del
 * emulador como administrador: la bitácora todavía no tiene vista (Historia 3).
 */
async function priceBatches(productId: string): Promise<Map<string, number>> {
  const response = await fetch('http://127.0.0.1:8080/v1/projects/demo-ecommerce/databases/(default)/documents/tenants/t1/auditLog?pageSize=1000', {
    headers: { Authorization: 'Bearer owner' },
  });
  type Field = { stringValue?: string; mapValue?: { fields: Record<string, Field> } };
  const { documents = [] } = (await response.json()) as { documents?: { fields: Record<string, Field> }[] };
  const batches = new Map<string, number>();
  for (const { fields } of documents) {
    const entityProduct = fields['entity']?.mapValue?.fields['productId']?.stringValue;
    if (fields['type']?.stringValue !== 'price.changed' || entityProduct !== productId) continue;
    const batch = fields['batchId']?.stringValue ?? '';
    batches.set(batch, (batches.get(batch) ?? 0) + 1);
  }
  return batches;
}

/** Un PNG de 1×1 píxel: lo mínimo que un navegador muestra como imagen. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// Paso 2, la parte de las imágenes (T060, FR-020, FR-038a): el producto y su variante implícita
// aceptan imágenes, siempre con texto alternativo.
test('el producto y su variante implícita aceptan imágenes con texto alternativo', async ({ page }) => {
  await createProduct(page, `Taza ${test.info().project.name}-${Date.now()}`);

  await test.step('una imagen del producto', async () => {
    await page.locator('app-product-editor > section app-image-upload input[type="file"]').setInputFiles({ name: 'taza.png', mimeType: 'image/png', buffer: PNG });
    const form = page.locator('app-product-editor > section app-image-upload form');
    await form.getByRole('button', { name: 'Subir imagen' }).click();
    await expect(form.getByText('Describí la imagen para quien no puede verla')).toBeVisible();
    await form.getByLabel('Texto alternativo').fill('Taza blanca de frente');
    await form.getByRole('button', { name: 'Subir imagen' }).click();
    await expect(page.getByRole('img', { name: 'Taza blanca de frente' })).toBeVisible();
  });

  await test.step('una imagen de la variante implícita', async () => {
    await variant(page, 'Única').getByRole('button', { name: 'Imágenes de Única (0)' }).click();
    const dialog = page.getByRole('dialog', { name: 'Imágenes de Única' });
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'asa.png', mimeType: 'image/png', buffer: PNG });
    await dialog.getByLabel('Texto alternativo').fill('Detalle del asa');
    await dialog.getByRole('button', { name: 'Subir imagen' }).click();
    await expect(dialog.getByRole('img', { name: 'Detalle del asa' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Listo' }).click();
    await expect(variant(page, 'Única').getByRole('button', { name: 'Imágenes de Única (1)' })).toBeVisible();
  });

  await test.step('un formato no admitido se avisa antes de subir', async () => {
    await page.locator('app-product-editor > section app-image-upload input[type="file"]').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
    await expect(page.getByRole('alert').filter({ hasText: 'Ese formato no se admite' })).toBeVisible();
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

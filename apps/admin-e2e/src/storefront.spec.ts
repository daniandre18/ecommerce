import { expect, test, type Page } from '@playwright/test';
import { call, idTokenOf, OWNER, productAsOwner, signIn } from './support';

/** Un sufijo por corrida y por proyecto: los recorridos no chocan entre sí ni con corridas viejas. */
const runId = () => `${test.info().project.name}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const slugField = (page: Page) => page.locator('[data-field="slug"]');

/** Publica por la callable: hace falta el SKU de la variante implícita (FR-023a de la 001). */
async function publish(productId: string, variantId: string, sku: string) {
  const token = await idTokenOf(OWNER);
  await call(token, 'setVariantSku', { tenantId: 't1', productId, variantId, version: 1, sku });
  const { body } = await call(token, 'setProductStatus', { tenantId: 't1', productId, version: 1, status: 'active' });
  expect(body.result).toEqual(expect.objectContaining({ ok: true }));
}

async function createFromDialog(page: Page, name: string): Promise<string> {
  await page.goto('/t/t1/catalog');
  await page.getByRole('button', { name: 'Nuevo producto' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo producto' });
  await dialog.getByLabel('Nombre').fill(name);
  // La vista previa busca la primera URL libre: se lee cuando terminó de buscar.
  await expect(dialog.locator('.slug-preview')).toContainText('Su URL será');
  const preview = (await dialog.locator('.slug-preview').textContent()) ?? '';
  await dialog.getByRole('button', { name: 'Crear' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  return preview;
}

// T043 — Historia 1, pasos 1 a 7 de quickstart.md, en escritorio y a 360 px.
test.describe('ficha de tienda', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await signIn(page, OWNER);
  });

  test('la URL se genera del nombre, se repite con sufijo y queda fija al publicar (FR-005 a FR-008)', async ({ page }) => {
    const run = runId();

    await test.step('1. al crear, el diálogo muestra la URL que va a recibir; repetida, con sufijo', async () => {
      expect(await createFromDialog(page, `Camiseta Básica ${run}`)).toContain(`…/camiseta-basica-${run}`);
      await expect(slugField(page)).toHaveValue(`camiseta-basica-${run}`);
      expect(await createFromDialog(page, `Camiseta Básica ${run}`)).toContain(`…/camiseta-basica-${run}-2`);
      await expect(slugField(page)).toHaveValue(`camiseta-basica-${run}-2`);
    });

    await test.step('2. en borrador, renombrar la regenera', async () => {
      await page.getByLabel('Nombre', { exact: true }).fill(`Remera ${run}`);
      await page.getByRole('button', { name: 'Guardar datos' }).click();
      await expect(slugField(page)).toHaveValue(`remera-${run}`);
    });

    await test.step('2. publicado, renombrar no la cambia; editada a mano, la anterior queda reservada', async () => {
      const { productId, variantId, url } = await productAsOwner(`Polo ${run}`);
      await publish(productId, variantId, `POLO-${run}`);
      await page.goto(url);
      await page.getByLabel('Nombre', { exact: true }).fill(`Polo Nuevo ${run}`);
      await page.getByRole('button', { name: 'Guardar datos' }).click();
      await expect(page.getByRole('heading', { level: 1, name: `Polo Nuevo ${run}` })).toBeVisible();
      await expect(slugField(page)).toHaveValue(`polo-${run}`);

      await slugField(page).fill(`polo-clasico-${run}`);
      await expect(page.locator('.slug-status')).toContainText('Disponible');
      await page.getByRole('button', { name: 'Guardar URL' }).click();
      await expect(slugField(page)).toHaveValue(`polo-clasico-${run}`);

      // Otro producto no puede tomar la anterior: está reservada para redirigir.
      const other = await productAsOwner(`Otro ${run}`);
      await page.goto(other.url);
      await slugField(page).fill(`polo-${run}`);
      await expect(page.locator('.slug-status')).toContainText('La usa otro producto');
      await expect(page.getByRole('button', { name: 'Guardar URL' })).toBeDisabled();
    });
  });

  test('buscadores, etiquetas, marca y video (FR-009 a FR-012, FR-018)', async ({ page }) => {
    const run = runId();
    const { url } = await productAsOwner(`Taza ${run}`);
    await page.goto(url);

    await test.step('3. vacíos, la vista previa usa el nombre; el título corta en 70', async () => {
      await expect(page.locator('.preview-title')).toHaveText(`Taza ${run}`);
      await expect(page.locator('.preview-note')).toContainText('Se usarán el nombre');
      await page.getByLabel('Título para buscadores').fill('a'.repeat(71));
      await expect(page.locator('.seo-title-count')).toHaveText('71/70');
      await page.getByLabel('Título para buscadores').fill(`Taza de cerámica ${run}`);
      await expect(page.locator('.preview-title')).toHaveText(`Taza de cerámica ${run}`);
    });

    await test.step('4. etiquetas sin repetir y marca guardadas', async () => {
      const tag = page.getByLabel('Agregar etiqueta');
      await tag.fill('Verano');
      await tag.press('Enter');
      await tag.fill('VERANO');
      await tag.press('Enter');
      await expect(page.locator('mat-chip .chip-label')).toHaveText(['Verano']);
      await page.getByLabel('Marca').fill(`Nativa ${run}`);
      await page.getByRole('button', { name: 'Guardar ficha' }).click();
      await expect(page.getByText('Ficha de tienda guardada')).toBeVisible();
    });

    await test.step('4. otra ficha sugiere la marca registrada', async () => {
      const other = await productAsOwner(`Plato ${run}`);
      await page.goto(other.url);
      await page.getByLabel('Marca').fill('nativa');
      await expect(page.locator('.brand-suggestions')).toContainText(`Nativa ${run}`);
    });

    await test.step('5. un video de YouTube queda en la galería; uno de otra plataforma se rechaza', async () => {
      await page.goto(url);
      await page.getByLabel('Enlace de YouTube o Vimeo').fill('https://www.dailymotion.com/video/x7tgad0');
      await expect(page.getByText('Solo se admiten videos de YouTube o Vimeo')).toBeVisible();
      await page.getByLabel('Enlace de YouTube o Vimeo').fill('https://youtu.be/dQw4w9WgXcQ');
      await page.getByRole('button', { name: 'Guardar video' }).click();
      await expect(page.getByText('Video de YouTube')).toBeVisible();
    });
  });

  test('tipo y envío: el cambio de tipo avisa al comprador y queda en la bitácora (FR-013 a FR-017, FR-032)', async ({ page }) => {
    const run = runId();
    const name = `Libro ${run}`;
    const { productId, url } = await productAsOwner(name);

    await test.step('6. un físico sin peso se señala en el listado y el filtro lo encuentra', async () => {
      await page.goto('/t/t1/catalog');
      await page.getByLabel('Mostrar').selectOption('missing');
      await expect(page.getByRole('link', { name: new RegExp(name) })).toContainText('Faltan datos de envío');
    });

    await test.step('6. con peso y dimensiones deja de faltar', async () => {
      await page.goto(url);
      await page.getByLabel('Peso').fill('0.45');
      await page.getByLabel('Largo').fill('30');
      await page.getByLabel('Ancho').fill('20');
      await page.getByLabel('Alto').fill('2');
      await page.getByRole('button', { name: 'Guardar envío' }).click();
      await expect(page.getByText('Faltan datos de envío')).toHaveCount(0);
    });

    await test.step('7. pasar a digital avisa qué cambia para el comprador, y deja la entrada', async () => {
      await page.getByLabel('Digital: no se envía').check();
      await expect(page.getByText('El comprador dejará de pagar envío')).toBeVisible();
      await page.getByRole('button', { name: 'Confirmar el cambio' }).click();
      // El párrafo de un producto digital, no el aviso: los dos dicen "no se envía".
      await expect(page.getByText('Un producto digital no se envía: no lleva peso ni dimensiones.')).toBeVisible();
    });

    await test.step('7. volver a físico recupera peso y dimensiones, y deja otra entrada', async () => {
      await page.getByLabel('Físico: se envía').check();
      await expect(page.getByText('El comprador pasará a pagar envío')).toBeVisible();
      await page.getByRole('button', { name: 'Confirmar el cambio' }).click();
      await expect(page.getByLabel('Peso')).toHaveValue('0.45');
    });

    await test.step('7. la bitácora tiene las dos entradas de condiciones de venta', async () => {
      await page.goto(`/t/t1/audit?product=${productId}&type=sale-conditions.changed`);
      const entries = page.getByRole('listitem').filter({ hasText: 'Condiciones de venta: envío' });
      await expect(entries).toHaveCount(2);
      await expect(entries.first()).toContainText('Sin envío');
    });
  });
});

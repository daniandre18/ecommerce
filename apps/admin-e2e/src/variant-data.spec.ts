import { expect, test, type Locator } from '@playwright/test';
import { call, EMULATORS, idTokenOf, OWNER, productWithVariants, signIn } from './support';

const documents = `${EMULATORS.firestore}/v1/projects/demo-ecommerce/databases/(default)/documents/tenants/t1`;
/** El emulador acepta `Bearer owner` como acceso de administración: lee sin pasar por las reglas. */
const admin = { Authorization: 'Bearer owner' };

/** Un EAN-13 válido y distinto en cada llamada: el dígito de control se calcula (GS1, pesos 3 y 1). */
function freshGtin(): string {
  const body = `${Date.now()}${Math.floor(Math.random() * 10)}`.slice(-12).padStart(12, '0');
  const sum = [...body].reverse().reduce((total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 3 : 1), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

/** Las variantes de un producto, con su id, su versión y su combinación, leídas del emulador. */
async function variantsOf(productId: string): Promise<{ id: string; version: number; label: string }[]> {
  const body = (await (await fetch(`${documents}/products/${productId}/variants`, { headers: admin })).json()) as {
    documents?: { name: string; fields: { version: { integerValue: string }; optionValues: { mapValue: { fields?: Record<string, { stringValue: string }> } } } }[];
  };
  return (body.documents ?? []).map((doc) => ({
    id: doc.name.split('/').at(-1) ?? '',
    version: Number(doc.fields.version.integerValue),
    label: Object.values(doc.fields.optionValues.mapValue.fields ?? {})
      .map((value) => value.stringValue)
      .sort()
      .join('/'),
  }));
}

async function gtinHolder(code: string): Promise<string | undefined> {
  const doc = (await (await fetch(`${documents}/gtinIndex/${code.padStart(14, '0')}`, { headers: admin })).json()) as { fields?: { variantId: { stringValue: string } } };
  return doc.fields?.variantId.stringValue;
}

const productIdOf = (url: string) => url.split('/').at(-1) ?? '';
/** El código de barras y el envío de una fila van plegados: se despliegan para editarlos. */
const expand = (row: Locator) => row.getByRole('button', { name: /^Código de barras/ }).click();
const field = (row: Locator, label: string) => row.getByLabel(label, { exact: true });

// T093 — Historia 4, pasos 1 a 4 de quickstart.md, en escritorio y a 360 px.
test.describe('datos por variante y catálogos externos', () => {
  test('GTIN: válido, inválido, y el de una variante archivada, que se libera desde el rechazo (FR-030)', async ({ page }) => {
    const run = `${test.info().project.name}-${Date.now()}`;
    const code = freshGtin();
    const owner = await idTokenOf(OWNER);

    // Una variante de otro producto con ese GTIN, archivada después.
    const archivedUrl = await productWithVariants(`Remera archivada ${run}`);
    const archivedProduct = productIdOf(archivedUrl);
    const [holder] = await variantsOf(archivedProduct);
    if (!holder) throw new Error('sin variantes');
    await call(owner, 'setVariantGtin', { tenantId: 't1', productId: archivedProduct, variantId: holder.id, version: holder.version, gtin: code });
    const archived = await call(owner, 'archiveVariant', { tenantId: 't1', productId: archivedProduct, variantId: holder.id, version: holder.version + 1 });
    expect(archived.body.result).toEqual(expect.objectContaining({ ok: true }));

    const url = await productWithVariants(`Remera ${run}`);
    await page.goto(url);
    await signIn(page, OWNER);
    const row = page.getByRole('group', { name: /^Rojo \/ S/ });

    await test.step('1. un GTIN de 13 dígitos válido se acepta; con el dígito de control mal, no', async () => {
      await expand(row);
      await field(row, 'GTIN').fill('4006381333932');
      await field(row, 'GTIN').press('Enter');
      await expect(row).toContainText('El dígito de control no corresponde');
      await field(row, 'GTIN').fill(freshGtin());
      await field(row, 'GTIN').press('Enter');
      await expect(row).not.toContainText('El dígito de control no corresponde');
    });

    await test.step('2. el de una variante archivada sigue reservado: el rechazo nombra el producto archivado', async () => {
      const other = page.getByRole('group', { name: /^Azul \/ M/ });
      await expand(other);
      await field(other, 'GTIN').fill(code);
      await field(other, 'GTIN').press('Enter');
      await expect(other).toContainText(`Ese GTIN ya lo usa «Remera archivada ${run}», archivado.`);
      expect(await gtinHolder(code)).toBe(holder.id);
    });

    await test.step('2. quitárselo a la archivada lo libera, y queda en esta variante', async () => {
      const other = page.getByRole('group', { name: /^Azul \/ M/ });
      await other.getByRole('button', { name: 'Quitárselo a la archivada y usarlo acá' }).click();
      await expect(other).not.toContainText('Ese GTIN ya lo usa');
      const mine = (await variantsOf(productIdOf(url))).find((v) => v.label === 'azul/m');
      await expect.poll(() => gtinHolder(code)).toBe(mine?.id);
    });
  });

  test('peso propio en una variante; las demás heredan el del producto, y borrarlo vuelve a heredar (FR-015)', async ({ page }) => {
    const run = `${test.info().project.name}-${Date.now()}`;
    const url = await productWithVariants(`Buzo ${run}`);
    const shipping = await call(await idTokenOf(OWNER), 'setProductShipping', {
      tenantId: 't1',
      productId: productIdOf(url),
      version: 2,
      weightGrams: 300,
      dimensionsMm: { length: 300, width: 200, height: 20 },
    });
    expect(shipping.body.result).toEqual(expect.objectContaining({ ok: true }));

    await page.goto(url);
    await signIn(page, OWNER);
    const xl = page.getByRole('group', { name: /^Azul \/ M/ });
    const other = page.getByRole('group', { name: /^Rojo \/ S/ });

    await test.step('3. con 450 g propios, la variante pesa 450 y las demás muestran 300 como heredado', async () => {
      // Plegada, la fila ya dice el peso heredado: no hace falta abrirla para verlo.
      await expect(other.locator('.more-summary')).toContainText('Peso 0.3 kg, heredado del producto');
      await expand(xl);
      await field(xl, 'Peso (kg)').fill('0,45');
      await field(xl, 'Peso (kg)').press('Enter');
      await expect(xl.locator('.more-summary')).toContainText('Peso 0.45 kg ·');
      await expect(other.locator('.more-summary')).toContainText('Peso 0.3 kg, heredado del producto');
    });

    await test.step('3. borrarlo vuelve a heredar', async () => {
      await field(xl, 'Peso (kg)').fill('');
      await field(xl, 'Peso (kg)').press('Enter');
      await expect(xl.locator('.more-summary')).toContainText('Peso 0.3 kg, heredado del producto');
    });
  });

  test('rango de edad legible, guardado con la taxonomía (FR-031)', async ({ page }) => {
    const run = `${test.info().project.name}-${Date.now()}`;
    const url = await productWithVariants(`Zapatilla ${run}`);
    await page.goto(url);
    await signIn(page, OWNER);

    await test.step('4. el selector muestra "0 a 3 meses" … "Adulto"; en Firestore queda adult', async () => {
      const ageGroup = page.getByLabel('Rango de edad');
      await expect(ageGroup.locator('option')).toHaveText(['Sin rango de edad', '0 a 3 meses', '3 a 12 meses', '1 a 5 años', '5 a 13 años', 'Adulto']);
      await ageGroup.selectOption({ label: 'Adulto' });
      await page.getByLabel('Género').selectOption({ label: 'Unisex' });
      await page.getByRole('button', { name: 'Guardar para catálogos externos' }).click();
      await expect(page.getByText('Datos para catálogos externos guardados')).toBeVisible();
      const doc = (await (await fetch(`${documents}/products/${productIdOf(url)}`, { headers: admin })).json()) as {
        fields: { ageGroup: { stringValue: string }; gender: { stringValue: string } };
      };
      expect([doc.fields.ageGroup.stringValue, doc.fields.gender.stringValue]).toEqual(['adult', 'unisex']);
    });
  });
});

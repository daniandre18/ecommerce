import { expect, test } from '@playwright/test';
import { call, CATALOG, EMULATORS, idTokenOf, OWNER, productAsOwner, signIn } from './support';

const auditUrl = (path = '') => `${EMULATORS.firestore}/v1/projects/demo-ecommerce/databases/(default)/documents/tenants/t1/auditLog${path}`;

// Historia 3 de quickstart.md, escenarios 1 y 2 (FR-031, FR-032, FR-034).
test('la Propietaria investiga los cambios de un producto: quién, cuándo, antes y después', async ({ page }) => {
  const run = `${test.info().project.name}-${Date.now()}`;
  const { productId, variantId, url } = await productAsOwner(`Bolso ${run}`);
  const stock = await call(await idTokenOf(CATALOG), 'setVariantStock', { tenantId: 't1', productId, changes: [{ variantId, version: 1, stock: { kind: 'quantity', value: 7 } }] });
  expect(stock.status).toBe(200);
  const price = await call(await idTokenOf(OWNER), 'setVariantPrice', { tenantId: 't1', productId, changes: [{ variantId, version: 2, price: { amount: 52000, currency: 'COP' } }] });
  expect(price.status).toBe(200);

  await page.goto(url);
  await signIn(page, OWNER);
  await page.getByRole('link', { name: 'Ver sus cambios en la bitácora' }).click();
  await expect(page).toHaveURL(new RegExp(`/t/t1/audit\\?product=${productId}$`));
  await expect(page.locator('.product')).toContainText(`Bolso ${run}`);

  const entries = page.getByRole('list', { name: 'Entradas de la bitácora' }).getByRole('listitem');
  await expect(entries).toHaveCount(2);
  await expect(entries.nth(0)).toContainText(`Cambio de precio · Bolso ${run} · Única`);
  await expect(entries.nth(0)).toContainText('Propietaria de t1');
  await expect(entries.nth(0)).toContainText('Sin precio');
  await expect(entries.nth(0)).toContainText('52.000 COP');
  await expect(entries.nth(1)).toContainText('Ajuste de existencias');
  await expect(entries.nth(1)).toContainText('Catálogo de t1');
  await expect(entries.nth(1)).toContainText('Sin definir');

  await page.getByLabel('Tipo de evento').selectOption({ label: 'Existencias' });
  await expect(page).toHaveURL(/type=stock\.adjusted/);
  await expect(entries).toHaveCount(1);
  await expect(entries.nth(0)).toContainText('Ajuste de existencias');
});

// Escenario 2 de la Historia 3 y T088: ni siendo Propietaria se altera una entrada desde la consola.
test('una entrada de la bitácora no se edita ni se borra, ni siquiera siendo Propietaria', async () => {
  const { productId, variantId } = await productAsOwner(`Llavero ${Date.now()}`);
  const owner = await idTokenOf(OWNER);
  await call(owner, 'setVariantPrice', { tenantId: 't1', productId, changes: [{ variantId, version: 1, price: { amount: 1000, currency: 'COP' } }] });

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${owner}` };
  const query = await fetch(`${EMULATORS.firestore}/v1/projects/demo-ecommerce/databases/(default)/documents/tenants/t1:runQuery`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'auditLog' }],
        where: { fieldFilter: { field: { fieldPath: 'entity.productId' }, op: 'EQUAL', value: { stringValue: productId } } },
      },
    }),
  });
  const [found] = (await query.json()) as { document?: { name: string; fields: Record<string, unknown> } }[];
  const document = found?.document;
  if (!document) throw new Error('El cambio de precio no dejó su entrada');
  const id = document.name.split('/').at(-1);

  const edit = await fetch(auditUrl(`/${id}?updateMask.fieldPaths=actorName`), {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: { actorName: { stringValue: 'Otra persona' } } }),
  });
  expect(edit.status).toBe(403);
  expect((await fetch(auditUrl(`/${id}`), { method: 'DELETE', headers })).status).toBe(403);

  const after = (await (await fetch(auditUrl(`/${id}`), { headers })).json()) as { fields: Record<string, unknown> };
  expect(after.fields).toEqual(document.fields);
});

// FR-015 y FR-034: la bitácora tiene costos; el rol de Catálogo ni la ve ofrecida.
test('el rol de Catálogo no ve la bitácora', async ({ page }) => {
  await page.goto('/t/t1/catalog');
  await signIn(page, CATALOG);
  await expect(page.getByRole('link', { name: 'Catálogo' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Bitácora' })).toHaveCount(0);
  await page.goto('/t/t1/audit');
  await expect(page.getByText('Solo el Propietario consulta la bitácora')).toBeVisible();
});

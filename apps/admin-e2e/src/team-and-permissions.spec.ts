import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'test-1234';
const OWNER = 'owner@t1.test';
const CATALOG = 'catalogo@t1.test';

const EMULATORS = { auth: 'http://127.0.0.1:9099', firestore: 'http://127.0.0.1:8080', functions: 'http://127.0.0.1:5001/demo-ecommerce/us-central1' };

async function signIn(page: Page, email: string) {
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** El token de sesión de una cuenta sembrada, como lo obtendría su navegador. */
async function idTokenOf(email: string): Promise<string> {
  const response = await fetch(`${EMULATORS.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  return ((await response.json()) as { idToken: string }).idToken;
}

/** El token de App Check sin firmar que acepta el emulador, el mismo que fabrica el panel. */
function emulatorAppCheck(): string {
  const part = (json: object) => Buffer.from(JSON.stringify(json)).toString('base64url');
  return `${part({ alg: 'none', typ: 'JWT' })}.${part({ sub: 'demo-admin', exp: Math.floor(Date.now() / 1000) + 3600 })}.`;
}

/** Una callable pedida a mano, sin pasar por el panel: lo que haría alguien desde la consola. */
async function call(idToken: string, name: string, data: object): Promise<{ status: number; body: { result?: unknown; error?: { status: string } } }> {
  const response = await fetch(`${EMULATORS.functions}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'X-Firebase-AppCheck': emulatorAppCheck() },
    body: JSON.stringify({ data }),
  });
  return { status: response.status, body: await response.json() };
}

/** Crea un producto como Propietaria por la callable y devuelve el editor y su variante implícita. */
async function productAsOwner(name: string): Promise<{ productId: string; variantId: string; url: string }> {
  const { body } = await call(await idTokenOf(OWNER), 'createProduct', { tenantId: 't1', requestId: crypto.randomUUID(), name });
  const { data } = body.result as { data: { productId: string; variantId: string } };
  return { ...data, url: `/t/t1/catalog/${data.productId}` };
}

// Historia 2, paso 4 de quickstart.md (FR-015, FR-016): el rol de Catálogo predefinido.
test('el rol de Catálogo ve los precios sin poder cambiarlos y no ve el costo', async ({ page, browser }) => {
  const run = `${test.info().project.name}-${Date.now()}`;
  const { url } = await productAsOwner(`Gorra ${run}`);

  await page.goto(url);
  await signIn(page, OWNER);
  const ownerRow = page.getByRole('group', { name: /^Única/ });
  await ownerRow.getByLabel(/^Precio \(/).fill('52000');
  await ownerRow.getByLabel(/^Precio \(/).press('Tab');
  await ownerRow.getByLabel(/^Costo/).fill('30000');
  await ownerRow.getByLabel(/^Costo/).press('Tab');
  await expect(ownerRow.getByLabel(/^Precio \(/)).toHaveValue('52.000');
  await expect(ownerRow.getByLabel(/^Costo/)).toHaveValue('30.000');

  const other = await browser.newContext();
  const catalog = await other.newPage();
  await catalog.goto(url);
  await signIn(catalog, CATALOG);
  const row = catalog.getByRole('group', { name: /^Única/ });
  await expect(row.getByLabel(/^Precio \(/)).toHaveValue('52.000');
  await expect(row.getByLabel(/^Precio \(/)).not.toBeEditable();
  await expect(row.getByLabel(/^Precio tachado/)).not.toBeEditable();
  await expect(row.getByLabel('Existencias')).toBeEditable();
  await expect(row.getByLabel(/^Costo/)).toHaveCount(0);
  await other.close();
});

// Paso 6 de quickstart.md (FR-010): ocultar el control es cosmético; el servidor es el que niega.
test('evitando la interfaz, el rol de Catálogo no cambia precios ni costo, ni escribe directo', async () => {
  const { productId, variantId } = await productAsOwner(`Taza ${Date.now()}`);
  const token = await idTokenOf(CATALOG);
  const price = { amount: 1000, currency: 'COP' };

  const priceCall = await call(token, 'setVariantPrice', { tenantId: 't1', productId, changes: [{ variantId, version: 1, price }] });
  expect(priceCall.body.error?.status).toBe('PERMISSION_DENIED');
  const costCall = await call(token, 'setVariantCost', { tenantId: 't1', productId, changes: [{ variantId, cost: price }] });
  expect(costCall.body.error?.status).toBe('PERMISSION_DENIED');

  const direct = await fetch(`${EMULATORS.firestore}/v1/projects/demo-ecommerce/databases/(default)/documents/tenants/t1/products/${productId}/variants/${variantId}?updateMask.fieldPaths=price`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fields: { price: { mapValue: { fields: { amount: { integerValue: '1' }, currency: { stringValue: 'COP' } } } } } }),
  });
  expect(direct.status).toBe(403);

  const costs = await fetch(`${EMULATORS.firestore}/v1/projects/demo-ecommerce/databases/(default)/documents/tenants/t1/products/${productId}/private/costs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(costs.status).toBe(403);
});

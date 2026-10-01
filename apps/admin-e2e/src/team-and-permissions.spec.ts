import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'test-1234';
const OWNER = 'owner@t1.test';
const CATALOG = 'catalogo@t1.test';
const MULTI = 'multi@test';

const EMULATORS = { auth: 'http://127.0.0.1:9099', firestore: 'http://127.0.0.1:8080', functions: 'http://127.0.0.1:5001/demo-ecommerce/us-central1' };

async function signIn(page: Page, email: string) {
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** La sesión de una cuenta, como la obtendría su navegador: su token y su uid. */
async function sessionOf(email: string): Promise<{ idToken: string; uid: string }> {
  const response = await fetch(`${EMULATORS.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  const { idToken, localId } = (await response.json()) as { idToken: string; localId: string };
  return { idToken, uid: localId };
}

const idTokenOf = async (email: string) => (await sessionOf(email)).idToken;

/**
 * Quien todavía no tiene cuenta abre el enlace, pasa por el inicio de sesión, crea la cuenta y
 * vuelve a la invitación, sin aceptarla todavía.
 */
async function signUpFromLink(page: Page, link: string, email: string, name: string) {
  await page.goto(link);
  await page.getByRole('link', { name: 'Creá una' }).click();
  await page.getByLabel('Tu nombre').fill(name);
  await page.getByLabel('Correo', { exact: true }).fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Te invitaron a un comercio' })).toBeVisible();
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

// Historia 2 de quickstart.md, pasos 1, 2, 5, 7 y 9: el Propietario arma su equipo desde el panel.
test('invitar, aceptar, ajustar un rol y dar de baja, con efecto en la operación siguiente', async ({ page, browser }) => {
  const run = `${test.info().project.name}-${Date.now()}`;
  const email = `nuevo-${run}@t1.test`;
  const name = `Nuevo ${run}`;
  const { url: productUrl } = await productAsOwner(`Mate ${run}`);

  const link = await test.step('la Propietaria invita con el rol de Catálogo y obtiene el enlace', async () => {
    await page.goto('/t/t1/team');
    await signIn(page, OWNER);
    await page.getByLabel('Correo de la persona').fill(email);
    await page.getByRole('button', { name: 'Invitar' }).click();
    const shared = page.getByLabel('Enlace de la invitación');
    await expect(shared).toHaveValue(/\/invitation\/t1\//);
    await expect(page.getByRole('group', { name: email })).toContainText('Catálogo');
    return shared.inputValue();
  });

  const other = await browser.newContext();
  const invited = await other.newPage();
  await test.step('sin aceptar no accede a nada (FR-007); al aceptar, entra', async () => {
    await signUpFromLink(invited, link, email, name);
    await invited.goto('/t/t1/catalog');
    await expect(invited.getByText('Puede que no exista o que no tengas acceso')).toBeVisible();
    await invited.goto(link);
    await invited.getByRole('button', { name: 'Aceptar invitación' }).click();
    await expect(invited).toHaveURL(/\/t\/t1\/catalog$/);
    await expect(page.getByRole('group', { name })).toContainText('Catálogo · Activa');
  });

  await test.step('con el rol de Catálogo ve el precio sin poder cambiarlo', async () => {
    await invited.goto(productUrl);
    await expect(invited.getByRole('group', { name: /^Única/ }).getByLabel(/^Precio \(/)).not.toBeEditable();
  });

  await test.step('un rol propio nace de otro y suma precios, sin costo (FR-009, FR-015)', async () => {
    await page.getByLabel('Nombre del rol nuevo').fill(`Precios ${run}`);
    await page.getByLabel('Empezar con los permisos de').selectOption({ label: 'Catálogo' });
    await page.getByRole('button', { name: 'Crear rol' }).click();
    await expect(page.getByRole('heading', { level: 1, name: `Precios ${run}` })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Editar el catálogo/ })).toBeChecked();
    await page.getByRole('checkbox', { name: /Cambiar precios/ }).check();
    await page.getByRole('button', { name: 'Guardar rol' }).click();
    await expect(page.getByRole('button', { name: 'Guardar rol' })).toHaveCount(0);
    await page.getByRole('link', { name: '← Equipo' }).click();
    await page.getByRole('group', { name }).getByLabel(`Rol de ${name}`).selectOption({ label: `Precios ${run}` });
    await expect(page.getByRole('group', { name })).toContainText(`Precios ${run} · Activa`);
  });

  await test.step('el cambio rige sin cerrar sesión ni recargar (FR-008), y el costo sigue oculto', async () => {
    const row = invited.getByRole('group', { name: /^Única/ });
    await expect(row.getByLabel(/^Precio \(/)).toBeEditable();
    await expect(row.getByLabel(/^Costo/)).toHaveCount(0);
  });

  await test.step('dada de baja, pierde el acceso de inmediato (FR-008a)', async () => {
    await page.getByRole('group', { name }).getByRole('button', { name: 'Dar de baja' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Dar de baja' }).click();
    await expect(page.getByRole('group', { name })).toContainText('De baja');
    await expect(invited.getByText('Puede que no exista o que no tengas acceso')).toBeVisible();
  });
  await other.close();
});

// "Cuentas en varios comercios" de quickstart.md (FR-005, FR-008a): cada membresía es independiente.
test('una cuenta en dos comercios: cada membresía decide sola, y la baja en uno no toca el otro', async ({ page, browser }) => {
  const run = `${test.info().project.name}-${Date.now()}`;
  const email = `doble-${run}@t1.test`;

  await test.step('ser Propietaria de t2 no concede nada en t1', async () => {
    await page.goto('/login');
    await signIn(page, MULTI);
    await page.getByRole('link', { name: /Comercio Dos/ }).click();
    await expect(page.getByRole('link', { name: 'Equipo' })).toBeVisible();
    await page.goto('/t/t1/catalog');
    await expect(page.locator('header')).toContainText('Comercio Uno');
    await expect(page.getByRole('link', { name: 'Equipo' })).toHaveCount(0);
    await page.goto('/t/t1/team');
    await expect(page.getByText('Solo el Propietario administra el equipo')).toBeVisible();
  });

  const invite = async (inviter: string, tenantId: string) => {
    const { body } = await call(await idTokenOf(inviter), 'inviteCollaborator', { tenantId, email, roleId: 'catalog' });
    return `/invitation/${(body.result as { data: { token: string } }).data.token}`;
  };
  const other = await browser.newContext();
  const person = await other.newPage();
  await test.step('invitada por los dos comercios, la misma cuenta suma dos membresías', async () => {
    await signUpFromLink(person, await invite(OWNER, 't1'), email, `Doble ${run}`);
    await person.getByRole('button', { name: 'Aceptar invitación' }).click();
    await expect(person).toHaveURL(/\/t\/t1\/catalog$/);
    await person.goto(await invite(MULTI, 't2'));
    await person.getByRole('button', { name: 'Aceptar invitación' }).click();
    await expect(person).toHaveURL(/\/t\/t2\/catalog$/);
    await person.goto('/');
    await expect(person.getByRole('link', { name: /Comercio Uno/ })).toBeVisible();
    await expect(person.getByRole('link', { name: /Comercio Dos/ })).toBeVisible();
  });

  await test.step('la baja en t1 corta t1 y deja t2 intacto', async () => {
    const { uid } = await sessionOf(email);
    await call(await idTokenOf(OWNER), 'setMembershipEnabled', { tenantId: 't1', uid, enabled: false });
    await person.goto('/t/t1/catalog');
    await expect(person.getByText('Puede que no exista o que no tengas acceso')).toBeVisible();
    await person.goto('/t/t2/catalog');
    await expect(person.locator('header')).toContainText('Comercio Dos');
    await expect(person.getByRole('heading', { name: 'Catálogo' })).toBeVisible();
  });
  await other.close();
});

import { expect, test } from '@playwright/test';
import { call, CATALOG, EMULATORS, idTokenOf, MULTI, OWNER, productAsOwner, sessionOf, signIn, signUpFromLink } from './support';

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

import { expect, type Page } from '@playwright/test';

// Lo que comparten los recorridos e2e: las cuentas sembradas y cómo llegar al servidor como lo
// haría alguien desde la consola, sin pasar por el panel.

export const PASSWORD = 'test-1234';
export const OWNER = 'owner@t1.test';
export const CATALOG = 'catalogo@t1.test';
export const MULTI = 'multi@test';

export const EMULATORS = { auth: 'http://127.0.0.1:9099', firestore: 'http://127.0.0.1:8080', functions: 'http://127.0.0.1:5001/demo-ecommerce/us-central1' };

/** Inicia sesión desde la pantalla de inicio y espera a salir de ella: la sesión ya quedó guardada. */
export async function signIn(page: Page, email: string) {
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toHaveCount(0);
}

/** La sesión de una cuenta, como la obtendría su navegador: su token y su uid. */
export async function sessionOf(email: string): Promise<{ idToken: string; uid: string }> {
  const response = await fetch(`${EMULATORS.auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  const { idToken, localId } = (await response.json()) as { idToken: string; localId: string };
  return { idToken, uid: localId };
}

export const idTokenOf = async (email: string) => (await sessionOf(email)).idToken;

/**
 * Quien todavía no tiene cuenta abre el enlace, pasa por el inicio de sesión, crea la cuenta y
 * vuelve a la invitación, sin aceptarla todavía.
 */
export async function signUpFromLink(page: Page, link: string, email: string, name: string) {
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
export async function call(idToken: string, name: string, data: object): Promise<{ status: number; body: { result?: unknown; error?: { status: string } } }> {
  const response = await fetch(`${EMULATORS.functions}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}`, 'X-Firebase-AppCheck': emulatorAppCheck() },
    body: JSON.stringify({ data }),
  });
  return { status: response.status, body: await response.json() };
}

/** Crea un producto como Propietaria por la callable y devuelve el editor y su variante implícita. */
export async function productAsOwner(name: string): Promise<{ productId: string; variantId: string; url: string }> {
  const { body } = await call(await idTokenOf(OWNER), 'createProduct', { tenantId: 't1', requestId: crypto.randomUUID(), name });
  const { data } = body.result as { data: { productId: string; variantId: string } };
  return { ...data, url: `/t/t1/catalog/${data.productId}` };
}

/** Un producto con dos opciones y cuatro variantes: la tabla más exigente para una pantalla angosta. */
export async function productWithVariants(name: string): Promise<string> {
  const { productId, variantId, url } = await productAsOwner(name);
  const option = (id: string, label: string, values: string[]) => ({
    id,
    name: label,
    position: id === 'color' ? 0 : 1,
    values: values.map((value, position) => ({ id: value.toLowerCase(), label: value, position })),
  });
  const result = await call(await idTokenOf(OWNER), 'setProductOptions', {
    tenantId: 't1',
    productId,
    version: 1,
    options: [option('color', 'Color', ['Rojo', 'Azul']), option('talle', 'Talle', ['S', 'M'])],
    assignments: [
      { variantId, optionId: 'color', valueId: 'rojo' },
      { variantId, optionId: 'talle', valueId: 's' },
    ],
  });
  expect(result.status).toBe(200);
  return url;
}

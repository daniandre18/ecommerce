import { randomUUID } from 'node:crypto';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { createStorageRulesEnv, seed, USERS } from './env';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Un nombre nuevo por subida, como hace el panel: una imagen subida no se reemplaza. */
const newImage = () => `tenants/t1/products/p1/images/${randomUUID()}.png`;

// T060 — ningún cliente escribe en Firestore, pero las imágenes se suben directo a Storage: las
// reglas, que corren en el servidor, deciden quién, qué tipo, cuánto y dónde.
describe('subida de imágenes del catálogo', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => { env = await createStorageRulesEnv(); });
  afterAll(async () => { await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await env.clearStorage();
    await seed(env);
  });

  const upload = (user: string | null, path = newImage(), data: Uint8Array = PNG, contentType = 'image/png') => {
    const context = user ? env.authenticatedContext(user) : env.unauthenticatedContext();
    return context.storage().ref(path).put(data, { contentType });
  };

  it.each([
    ['la Propietaria', USERS.owner1],
    ['el rol de Catálogo, que tiene catalog.write', USERS.catalog1],
  ])('%s sube una imagen a la carpeta de un producto', async (_label, user) => {
    await assertSucceeds(upload(user));
  });

  it.each([
    ['un rol sin catalog.write', USERS.viewer1],
    ['una invitación sin aceptar', USERS.invited1],
    ['una cuenta de otro comercio', USERS.owner2],
    ['una cuenta sin membresía', USERS.outsider],
    ['sin sesión', null],
  ])('%s no sube nada', async (_label, user) => {
    await assertFails(upload(user));
  });

  it('solo imágenes: otro tipo se rechaza aunque la extensión diga .png', async () => {
    await assertFails(upload(USERS.owner1, newImage(), PNG, 'text/html'));
    await assertFails(upload(USERS.owner1, newImage(), PNG, 'image/svg+xml'));
  });

  it('hasta 5 MB', async () => {
    await assertFails(upload(USERS.owner1, newImage(), new Uint8Array(5 * 1024 * 1024 + 1)));
  });

  it('solo en la carpeta de imágenes de un producto', async () => {
    await assertFails(upload(USERS.owner1, 'tenants/t1/config/foto.png'));
    await assertFails(upload(USERS.owner1, 'tenants/t1/products/p1/foto.png'));
  });

  // Una imagen subida no se reemplaza ni se borra desde el cliente: un nombre nuevo por cada subida.
  it('una imagen existente no se sobrescribe ni se borra', async () => {
    const image = newImage();
    await assertSucceeds(upload(USERS.owner1, image));
    await assertFails(upload(USERS.owner1, image));
    await assertFails(env.authenticatedContext(USERS.owner1).storage().ref(image).delete());
  });

  it('los miembros activos la leen; los de otro comercio, no', async () => {
    const image = newImage();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref(image).put(PNG, { contentType: 'image/png' });
    });
    await assertSucceeds(env.authenticatedContext(USERS.viewer1).storage().ref(image).getDownloadURL());
    await assertFails(env.authenticatedContext(USERS.owner2).storage().ref(image).getDownloadURL());
  });
});

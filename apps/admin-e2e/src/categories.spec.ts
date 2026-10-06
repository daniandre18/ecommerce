import { expect, test, type Page } from '@playwright/test';
import { call, EMULATORS, idTokenOf, OWNER, PASSWORD, productAsOwner, signIn } from './support';

/** Un sufijo por corrida y por proyecto: los recorridos no chocan entre sí ni con corridas viejas. */
const runId = () => `${test.info().project.name}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** La fila de una categoría por su nombre exacto (sin las de sus subcategorías). */
const row = (page: Page, name: string) =>
  page.locator('li[data-category]').filter({
    has: page.locator(`xpath=./app-category-row//span[contains(@class, "category-name") and normalize-space(.) = "${name}"]`),
  });
/** Lo que dice la fila de su visibilidad: vacío si se ve. */
const state = (page: Page, name: string) => row(page, name).locator('xpath=./app-category-row//span[contains(@class, "category-state")]');

async function act(page: Page, name: string, action: string) {
  await page.getByRole('button', { name: `Acciones de «${name}»` }).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}

/** Crea una categoría por la callable, como Propietaria, y devuelve su id. */
async function category(name: string, parentId: string | null = null): Promise<string> {
  const { body } = await call(await idTokenOf(OWNER), 'createCategory', { tenantId: 't1', requestId: crypto.randomUUID(), parentId, name });
  const result = body.result as { ok: boolean; data: { categoryId: string } };
  expect(result.ok).toBe(true);
  return result.data.categoryId;
}

/**
 * Una cuenta nueva con un rol que solo lee el catálogo (Historia 2, escenario 10). El rol de
 * Catálogo sembrado sí edita el catálogo, así que no sirve para esto.
 */
async function readOnlyCollaborator(run: string): Promise<string> {
  const owner = await idTokenOf(OWNER);
  const created = await call(owner, 'createRole', { tenantId: 't1', name: `Solo lectura ${run}` });
  const { roleId } = (created.body.result as { data: { roleId: string } }).data;
  await call(owner, 'updateRole', { tenantId: 't1', roleId, permissions: ['catalog.read'] });
  const email = `lector-${run}@t1.test`;
  const invited = await call(owner, 'inviteCollaborator', { tenantId: 't1', email, roleId });
  const { token } = (invited.body.result as { data: { token: string } }).data;
  await fetch(`${EMULATORS.auth}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  const accepted = await call(await idTokenOf(email), 'acceptInvitation', { invitationToken: token });
  expect(accepted.body.result).toEqual(expect.objectContaining({ ok: true }));
  return email;
}

// T062 — Historia 2, pasos 1 a 7 de quickstart.md, en escritorio y a 360 px.
test.describe('categorías', () => {
  test('el árbol: tres niveles, la URL antes de crear, y el cuarto nivel se impide (FR-019 a FR-021)', async ({ page }) => {
    const run = runId();
    const [ropa, hombre, camisetas, mujer, camisas] = ['Ropa', 'Hombre', 'Camisetas', 'Mujer', 'Camisas'].map((name) => `${name} ${run}`) as [
      string,
      string,
      string,
      string,
      string,
    ];
    await page.goto('/login');
    await signIn(page, OWNER);
    await page.goto('/t/t1/categories');

    const create = async (name: string, parent: string | null) => {
      await page.locator('[data-field="newName"]').fill(name);
      await page.locator('[data-field="newParent"]').selectOption(parent === null ? { value: '' } : { label: parent });
      await expect(page.locator('.slug-preview')).toContainText('Su URL será');
      const preview = (await page.locator('.slug-preview').textContent()) ?? '';
      await page.getByRole('button', { name: 'Crear categoría' }).click();
      await expect(page.locator('[data-field="newName"]')).toHaveValue('');
      return preview;
    };

    await test.step('1. Ropa > Hombre > Camisetas, anidadas', async () => {
      await create(ropa, null);
      await create(hombre, ropa);
      await create(camisetas, `${ropa} › ${hombre}`);
      await create(mujer, ropa);
      await expect(row(page, camisetas)).toHaveAttribute('aria-level', '3');
      await expect(row(page, ropa).locator(`xpath=.//li[@data-category]`)).toHaveCount(3);
    });

    await test.step('1. dentro del tercer nivel no se ofrece crear, y el servidor lo rechaza', async () => {
      await expect(page.locator('[data-field="newParent"] option', { hasText: `${ropa} › ${hombre} › ${camisetas}` })).toHaveCount(0);
      const parentId = await row(page, camisetas).getAttribute('data-category');
      const { body } = await call(await idTokenOf(OWNER), 'createCategory', { tenantId: 't1', requestId: crypto.randomUUID(), parentId, name: 'Manga corta' });
      expect(body.result).toEqual(expect.objectContaining({ ok: false, code: 'category-limit', details: { reason: 'depth' } }));
    });

    await test.step('2. "Camisas" en Hombre y en Mujer: camisas y camisas-2, mostradas antes de crear', async () => {
      const slug = camisas.toLowerCase().replace(/\s+/g, '-');
      expect(await create(camisas, `${ropa} › ${hombre}`)).toContain(`…/${slug}`);
      expect(await create(camisas, `${ropa} › ${mujer}`)).toContain(`…/${slug}-2`);
      await expect(row(page, camisas)).toHaveCount(2);
    });
  });

  test('asignar, filtrar por la rama, ocultar y mostrar sin perder la visibilidad propia, mover (FR-021a a FR-023)', async ({ page }) => {
    const run = runId();
    const names = { ropa: `Ropa ${run}`, hombre: `Hombre ${run}`, camisetas: `Camisetas ${run}`, camisas: `Camisas ${run}`, mujer: `Mujer ${run}` };
    const ropa = await category(names.ropa);
    const hombre = await category(names.hombre, ropa);
    await category(names.camisetas, hombre);
    await category(names.camisas, hombre);
    await category(names.mujer, ropa);
    const product = await productAsOwner(`Remera ${run}`);

    await page.goto('/login');
    await signIn(page, OWNER);

    await test.step('3. asignado solo a Camisetas, aparece al filtrar por Ropa', async () => {
      await page.goto(product.url);
      await page.locator('[data-field="addCategory"]').selectOption({ label: `${names.ropa} › ${names.hombre} › ${names.camisetas}` });
      await page.getByRole('button', { name: 'Agregar', exact: true }).click();
      await page.getByRole('button', { name: 'Guardar categorías' }).click();
      await expect(page.getByText('Categorías guardadas')).toBeVisible();

      await page.goto('/t/t1/catalog');
      await page.getByLabel('Mostrar').selectOption('category');
      await page.locator('[data-field="category"]').selectOption({ label: names.ropa });
      await expect(page.getByRole('link', { name: new RegExp(`Remera ${run}`) })).toBeVisible();
    });

    await page.goto('/t/t1/categories');

    await test.step('4. Camisas se oculta por sí misma; después se oculta Hombre, con el aviso de cuántas', async () => {
      await act(page, names.camisas, 'Ocultar');
      await expect(state(page, names.camisas)).toHaveText('Oculta');

      await act(page, names.hombre, 'Ocultar');
      await expect(row(page, names.hombre).locator('xpath=./app-category-row')).toContainText('También quedan ocultas en la tienda sus 2 subcategorías');
      await row(page, names.hombre).locator('xpath=./app-category-row').getByRole('button', { name: 'Ocultar', exact: true }).click();
      await expect(state(page, names.hombre)).toHaveText('Oculta');
      await expect(state(page, names.camisetas)).toHaveText(`Oculta por su categoría padre (${names.hombre})`);
      await expect(state(page, names.camisas)).toHaveText('Oculta');
    });

    await test.step('4. mostrar Hombre: cada hija vuelve a la suya, y Camisas sigue oculta', async () => {
      await act(page, names.hombre, 'Mostrar');
      await expect(state(page, names.hombre)).toHaveCount(0);
      await expect(state(page, names.camisetas)).toHaveCount(0);
      await expect(state(page, names.camisas)).toHaveText('Oculta');
    });

    await test.step('4. el árbol se filtra por visibilidad', async () => {
      await page.getByLabel('Mostrar').selectOption('hidden');
      await expect(row(page, names.camisas)).toContainText(`${names.ropa} › ${names.hombre} › ${names.camisas}`);
      await expect(row(page, names.camisetas)).toHaveCount(0);
      await page.getByLabel('Mostrar').selectOption('all');
    });

    await test.step('5. Camisetas, dentro de Mujer oculta: su URL y su visibilidad propia no cambian', async () => {
      const slug = await row(page, names.camisetas).locator('xpath=./app-category-row//span[contains(@class, "category-slug")]').textContent();
      await act(page, names.mujer, 'Ocultar');
      await act(page, names.camisetas, 'Mover a…');
      await row(page, names.camisetas).locator('[data-field="destination"]').selectOption({ label: `${names.ropa} › ${names.mujer}` });
      await row(page, names.camisetas).getByRole('button', { name: 'Mover', exact: true }).click();
      await expect(row(page, names.mujer).locator('li[data-category]')).toHaveCount(1);
      await expect(row(page, names.camisetas).locator('xpath=./app-category-row//span[contains(@class, "category-slug")]')).toHaveText(slug ?? '');
      // Oculta de hecho por la rama, pero la suya sigue visible: se ofrece ocultarla, no mostrarla.
      await expect(state(page, names.camisetas)).toHaveText(`Oculta por su categoría padre (${names.mujer})`);
      await page.getByRole('button', { name: `Acciones de «${names.camisetas}»` }).click();
      await expect(page.getByRole('menuitem', { name: 'Ocultar', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
    });
  });

  test('eliminar una categoría con productos: el aviso dice cuántos la pierden (FR-024, FR-025)', async ({ page }) => {
    const run = runId();
    const temporada = `Temporada ${run}`;
    await category(temporada);
    const names = [`Gorra ${run}`, `Bufanda ${run}`];
    for (const name of names) await productAsOwner(name);

    await page.goto('/login');
    await signIn(page, OWNER);

    await test.step('6. asignada a los dos desde el listado, en una acción', async () => {
      await page.goto('/t/t1/catalog');
      for (const name of names) await page.getByRole('checkbox', { name: `Seleccionar «${name}»` }).check();
      await expect(page.getByText('2 seleccionados')).toBeVisible();
      await page.locator('[data-field="bulkCategory"]').selectOption({ label: temporada });
      await page.getByRole('button', { name: 'Asignar', exact: true }).click();
      await expect(page.getByText('2 seleccionados')).toHaveCount(0);
    });

    await test.step('6. eliminarla avisa antes cuántos productos la pierden', async () => {
      await page.goto('/t/t1/categories');
      await act(page, temporada, 'Eliminar');
      await expect(row(page, temporada)).toContainText(`2 productos dejarán de estar en «${temporada}»; no se modifican de ninguna otra forma.`);
      await row(page, temporada).getByRole('button', { name: 'Eliminar', exact: true }).click();
      await expect(row(page, temporada)).toHaveCount(0);
    });
  });

  test('quien solo lee el catálogo ve el árbol y filtra, sin acciones de edición (escenario 10)', async ({ page }) => {
    const run = runId();
    const visible = `Visible ${run}`;
    const id = await category(visible);
    await call(await idTokenOf(OWNER), 'setCategoryHidden', { tenantId: 't1', categoryId: await category(`Oculta ${run}`, id), hidden: true });
    const reader = await readOnlyCollaborator(run);

    await page.goto('/login');
    await signIn(page, reader);
    await page.goto('/t/t1/categories');

    await test.step('7. ve el árbol y su visibilidad, sin crear ni acciones', async () => {
      await expect(row(page, visible)).toBeVisible();
      await expect(state(page, `Oculta ${run}`)).toHaveText('Oculta');
      await expect(page.getByRole('button', { name: 'Crear categoría' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Acciones de/ })).toHaveCount(0);
    });

    await test.step('7. filtra el árbol y el catálogo por categoría, sin seleccionar productos', async () => {
      await page.getByLabel('Mostrar').selectOption('hidden');
      await expect(row(page, `Oculta ${run}`)).toBeVisible();
      await page.goto('/t/t1/catalog');
      await page.getByLabel('Mostrar').selectOption('category');
      await page.locator('[data-field="category"]').selectOption({ label: visible });
      await expect(page.getByRole('checkbox')).toHaveCount(0);
    });
  });
});

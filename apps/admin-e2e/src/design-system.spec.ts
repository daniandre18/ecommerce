import { expect, test } from '@playwright/test';
import { expectAccent, expectBackground, expectDestructive, expectPlanes, expectTypeHierarchy, readOnlyCollaborator } from './design-system-support';
import { call, idTokenOf, MULTI, OWNER, productAsOwner, signIn, signUpFromLink } from './support';

// 003 — el sistema de diseño, medido en lo que el navegador computa. Corre en los tres proyectos,
// `oscuro` incluido. Cada caso de una pantalla se titula `pantalla: <screen>`, con el `screen` textual
// de apps/admin/design-system/primary-actions.ts (G1).

// T024: los estados compartidos los usan todas las vistas, así que su caso va primero.
test.describe('estados compartidos', () => {
  test('el error del catálogo sin red es el aviso de error del sistema, sin acento ni color destructivo', async ({ page, context }) => {
    await page.goto('/login');
    await signIn(page, OWNER);
    await expect(page.getByRole('heading', { level: 1, name: 'Catálogo' })).toBeVisible();
    // La vista ya está descargada: sin red, lo que falta son los datos y no el código (como en
    // loading-states.spec.ts). Se sale y se vuelve, porque el listado abierto conserva lo que tenía.
    await page.getByRole('link', { name: 'Categorías', exact: true }).click();
    await expect(page).toHaveURL(/\/t\/t1\/categories$/);

    await context.setOffline(true);
    await page.getByRole('link', { name: 'Catálogo', exact: true }).click();
    const failure = page.getByRole('alert').filter({ hasText: 'No pudimos cargar el catálogo' });
    await expect(failure).toBeVisible({ timeout: 15_000 });

    await expectBackground(page, 'ui-error-state', '--ds-status-error-container');
    // El aviso no invita ni destruye: "Reintentar" es secundario. La acción principal de la vista
    // ("Nuevo producto") queda fuera del aviso, y su caso es el de "pantalla: catálogo" (T029).
    await expectAccent(page, null, { selector: 'ui-error-state' });
    await expectDestructive(page, [], { selector: 'ui-error-state' });
  });
});

// T025: el diálogo de confirmación. Sus cinco usos son destructivos, así que el caso usa uno, el de
// salir con cambios sin guardar, que se abre desde cualquier editor.
test('pantalla: diálogo: confirmación', async ({ page }) => {
  const { url } = await productAsOwner(`Confirmación ${Date.now()}`);
  await page.goto(url);
  await signIn(page, OWNER);
  await page.getByLabel('Nombre', { exact: true }).fill('Nombre a medio escribir');
  await page.getByRole('link', { name: '← Catálogo' }).click();
  await expect(page.getByRole('dialog', { name: 'Hay cambios sin guardar' })).toBeVisible();

  // Destructiva sin acento (contracts/primary-actions.md, caso 3): el fondo de error, y nada más con él.
  await expectAccent(page, null, 'dialog');
  await expectDestructive(page, ['Salir sin guardar'], 'dialog');
});

// T026: el marco del comercio. No es una pantalla de primary-actions.ts (es `FRAMES`), pero toda vista
// del comercio lo tiene: la barra, el nombre del comercio y el enlace de la sección abierta.
test('marco del comercio: barra, nombre en título de sección y enlace activo en el color de enlace', async ({ page }) => {
  await page.goto('/login');
  await signIn(page, OWNER);
  await expect(page.getByRole('heading', { level: 1, name: 'Catálogo' })).toBeVisible();

  await expectBackground(page, 'app-tenant-shell header', '--ds-surface-bar');
  const found = await page.evaluate(() => {
    const probe = document.body.appendChild(document.createElement('p'));
    probe.style.font = 'var(--ds-type-section-title)';
    probe.style.color = 'var(--ds-text-link)';
    const expected = { font: getComputedStyle(probe).fontSize + ' ' + getComputedStyle(probe).fontWeight, link: getComputedStyle(probe).color };
    probe.remove();
    const tenant = getComputedStyle(document.querySelector('app-tenant-shell .tenant') as Element);
    const active = getComputedStyle(document.querySelector('app-tenant-shell nav [aria-current="page"]') as Element);
    return { expected, tenant: tenant.fontSize + ' ' + tenant.fontWeight, link: active.color, underline: active.textDecorationLine };
  });
  expect(found.tenant).toBe(found.expected.font);
  expect(found.link).toBe(found.expected.link);
  expect(found.underline, 'el enlace activo no depende solo del color (WCAG 1.4.1)').toBe('underline');
});

// T027: autenticación. Fuera del marco del comercio: página y tarjeta, sin barra (SC-005, FR-010).
test('pantalla: iniciar sesión', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1, name: 'Iniciar sesión' })).toBeVisible();
  await expectAccent(page, 'Entrar');
  await expectDestructive(page, []);
  await expectPlanes(page, 'page-card');
  await expectTypeHierarchy(page);
});

test('pantalla: crear cuenta', async ({ page }) => {
  await page.goto('/signup');
  await expect(page.getByRole('heading', { level: 1, name: 'Crear cuenta' })).toBeVisible();
  await expectAccent(page, 'Crear cuenta');
  await expectDestructive(page, []);
  await expectPlanes(page, 'page-card');
  await expectTypeHierarchy(page);
});

// T028: comercios e invitación, también fuera del marco: página y tarjeta, sin barra.
test('pantalla: tus comercios', async ({ page }) => {
  await page.goto('/login');
  await signIn(page, MULTI);
  await expect(page.getByRole('heading', { level: 1, name: 'Tus comercios' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Comercio Dos/ })).toBeVisible();
  await expectAccent(page, null);
  await expectDestructive(page, []);
  await expectPlanes(page, 'page-card');
  await expectTypeHierarchy(page);
});

/** Un enlace de invitación nuevo de la Propietaria de t1 para `email`, con el rol de Catálogo. */
async function invitation(email: string): Promise<string> {
  const { body } = await call(await idTokenOf(OWNER), 'inviteCollaborator', { tenantId: 't1', email, roleId: 'catalog' });
  return `/invitation/${(body.result as { data: { token: string } }).data.token}`;
}

test.describe('pantalla: invitación', () => {
  test('pendiente: el acento es "Aceptar invitación"', async ({ page }) => {
    const email = `invitada-${Date.now()}@t1.test`;
    await signUpFromLink(page, await invitation(email), email, 'Invitada');
    await expectAccent(page, 'Aceptar invitación');
    await expectDestructive(page, []);
    await expectPlanes(page, 'page-card');
    await expectTypeHierarchy(page);
  });

  // Los estados son excluyentes: si la cuenta ya es miembro, el acento pasa a "Entrar al comercio".
  test('ya es miembro: el acento es "Entrar al comercio"', async ({ page }) => {
    const email = `doble-${Date.now()}@t1.test`;
    const [first, second] = [await invitation(email), await invitation(email)];
    await signUpFromLink(page, first, email, 'Doble');
    await page.getByRole('button', { name: 'Aceptar invitación' }).click();
    await expect(page).toHaveURL(/\/t\/t1\/catalog$/);
    await page.goto(second);
    await page.getByRole('button', { name: 'Aceptar invitación' }).click();
    await expect(page.getByRole('link', { name: 'Entrar al comercio' })).toBeVisible();
    await expectAccent(page, 'Entrar al comercio');
  });

  // Con otra cuenta, lo único que queda es "Cerrar sesión", que es secundaria: ningún acento.
  test('de otra cuenta: sin acento', async ({ page }) => {
    const link = await invitation(`otra-${Date.now()}@t1.test`);
    await page.goto('/login');
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/t\/t1\/catalog$/);
    await page.goto(link);
    await page.getByRole('button', { name: 'Aceptar invitación' }).click();
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    await expectAccent(page, null);
    await expectDestructive(page, []);
  });
});

// T029: el catálogo. El acento es "Nuevo producto", haya productos o no: "Crear producto" del estado vacío
// es confirmación de sección, y el acento no cambia de lugar (contracts/primary-actions.md).
test.describe('pantalla: catálogo', () => {
  test('con productos, y con la barra de selección abierta, el único acento es "Nuevo producto"', async ({ page }) => {
    await productAsOwner(`Catálogo ${Date.now()}`);
    await page.goto('/login');
    await signIn(page, OWNER);
    await expect(page.getByRole('heading', { level: 1, name: 'Catálogo' })).toBeVisible();
    await expect(page.locator('ui-skeleton')).toHaveCount(0);
    await expectAccent(page, 'Nuevo producto');
    await expectDestructive(page, []);
    await expectPlanes(page, 'page-card-bar');
    await expectTypeHierarchy(page);

    // "Asignar" y "Agregar a la sección" son confirmaciones de sección: no suman acento.
    await page.getByRole('checkbox', { name: /^Seleccionar «/ }).first().check();
    await expect(page.getByRole('group', { name: 'Acción sobre los seleccionados' })).toBeVisible();
    await expectAccent(page, 'Nuevo producto');
  });

  test('vacío: el acento sigue en "Nuevo producto", no en "Crear producto"', async ({ page }) => {
    await page.goto('/login');
    await signIn(page, MULTI);
    await page.getByRole('link', { name: /Comercio Dos/ }).click();
    await expect(page.getByText('Todavía no hay productos')).toBeVisible();
    await expectAccent(page, 'Nuevo producto');
    await expectPlanes(page, 'page-card-bar');
  });

  // T030, historia 1, escenario 2: sin `catalog.write` no hay acción principal, así que no hay acento.
  test('sin permiso de escritura: ningún acento', async ({ page }) => {
    // Depende de T102 de la 001: si catalog.read sale del enumerado, usar un rol sin permisos.
    const email = await readOnlyCollaborator(`sin-acento-${Date.now()}`);
    await productAsOwner(`Solo lectura ${Date.now()}`);
    await page.goto('/login');
    await signIn(page, email);
    await expect(page.getByRole('heading', { level: 1, name: 'Catálogo' })).toBeVisible();
    await expect(page.locator('main ul li').first()).toBeVisible();
    await expectAccent(page, null);
    await expectDestructive(page, []);
  });
});

test('pantalla: diálogo: nuevo producto', async ({ page }) => {
  await page.goto('/login');
  await signIn(page, OWNER);
  await page.getByRole('button', { name: 'Nuevo producto' }).click();
  await expect(page.getByRole('dialog', { name: 'Nuevo producto' })).toBeVisible();
  await expectAccent(page, 'Crear', 'dialog');
  await expectDestructive(page, [], 'dialog');
});

// T031: el editor de producto. Sin acción principal: se edita por partes, y cada sección se confirma
// con su propio "Guardar", en primario. "Archivar producto" es la única destructiva.
test('pantalla: producto', async ({ page }) => {
  const { url } = await productAsOwner(`Editor ${Date.now()}`);
  await page.goto(url);
  await signIn(page, OWNER);
  await expect(page.getByRole('group', { name: /^Única/ })).toBeVisible();
  await expect(page.locator('ui-skeleton')).toHaveCount(0);
  await expectAccent(page, null);
  await expectDestructive(page, ['Archivar producto']);
  await expectPlanes(page, 'page-card-bar');
  // T032: con las imágenes migradas, el `h3` del editor (`image-upload`) ya está en su nivel.
  await expectTypeHierarchy(page);
  // Cada sección del editor es una tarjeta, y cada variante una fila del sistema (T032).
  expect(await page.locator('app-variant-table li').evaluateAll((rows) => rows.filter((row) => !row.classList.contains('ds-table-row')).length)).toBe(0);
  const sections = page.locator('app-product-editor > section');
  expect(await sections.count()).toBeGreaterThan(0);
  expect(await sections.evaluateAll((all) => all.filter((section) => !section.classList.contains('ds-card')).length)).toBe(0);

  // Historia 1, escenario 1: con dos secciones con cambios, sus "Guardar" tienen el mismo fondo, el
  // primario, y siguen sin acento.
  await page.getByLabel('Nombre', { exact: true }).fill(`Editado ${Date.now()}`);
  await page.locator('app-presentation-section mat-checkbox input').first().click();
  const fills = await page.evaluate(() => {
    const probe = document.body.appendChild(document.createElement('div'));
    probe.style.background = 'var(--ds-primary)';
    const primary = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const saves = [...document.querySelectorAll<HTMLButtonElement>('main .mat-mdc-unelevated-button')]
      .filter((button) => !button.disabled && /^Guardar/.test(button.textContent?.trim() ?? ''))
      .map((button) => ({ name: button.textContent?.trim(), background: getComputedStyle(button).backgroundColor }));
    return { primary, saves };
  });
  expect(fills.saves.length, 'hacen falta dos secciones con cambios para comparar').toBeGreaterThanOrEqual(2);
  for (const save of fills.saves) expect(save.background, save.name).toBe(fills.primary);
  await expectAccent(page, null);
});

// T032: los diálogos de las variantes. "Confirmar" es la tarea del primero; el de imágenes no tiene
// acción principal: cada imagen se guarda por su cuenta y "Listo" solo cierra.
test('pantalla: diálogo: qué valor tiene cada variante', async ({ page }) => {
  const { url } = await productAsOwner(`Asignar ${Date.now()}`);
  await page.goto(url);
  await signIn(page, OWNER);
  const only = page.getByRole('group', { name: /^Única/ });
  const sku = only.getByLabel(/^SKU/);
  await sku.fill(`SKU-${Date.now()}`);
  await sku.press('Tab');
  await expect(only).not.toContainText('Falta el SKU');
  await page.getByRole('button', { name: 'Agregar opción' }).click();
  const option = page.getByRole('group', { name: 'Opción nueva' });
  await option.getByLabel('Nombre de la opción', { exact: true }).fill('Color');
  const color = page.getByRole('group', { name: 'Color', exact: true });
  await color.getByLabel('Valor 1', { exact: true }).fill('Rojo');
  await page.getByRole('button', { name: 'Guardar opciones' }).click();
  await expect(page.getByRole('dialog', { name: '¿Qué valor tiene cada variante?' })).toBeVisible();
  await expectAccent(page, 'Confirmar', 'dialog');
  await expectDestructive(page, [], 'dialog');
});

test('pantalla: diálogo: imágenes de una variante', async ({ page }) => {
  const { url } = await productAsOwner(`Imágenes ${Date.now()}`);
  await page.goto(url);
  await signIn(page, OWNER);
  await page.getByRole('group', { name: /^Única/ }).getByRole('button', { name: 'Imágenes de Única (0)' }).click();
  await expect(page.getByRole('dialog', { name: 'Imágenes de Única' })).toBeVisible();
  await expectAccent(page, null, 'dialog');
  await expectDestructive(page, [], 'dialog');
});

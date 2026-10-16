import { expect, test, type Page } from '@playwright/test';
import { expectAccent, expectBackground, expectDeclaredPairs, expectDestructive, expectErrorIcon, expectPlanes, expectTypeHierarchy, pressedContrast, readOnlyCollaborator } from './design-system-support';
import { call, idTokenOf, MULTI, OWNER, productAsOwner, signIn, signUpFromLink } from './support';

// 003 — el sistema de diseño, medido en lo que el navegador computa. Corre en los tres proyectos,
// `oscuro` incluido. Cada caso de una pantalla se titula `pantalla: <screen>`, con el `screen` textual
// de apps/admin/design-system/primary-actions.ts (G1).
//
// Los productos que crean estos casos empiezan con "DS-" y no contienen el nombre de ninguna sección
// (Catálogo, Categorías, Equipo, Bitácora): el catálogo los muestra como enlaces, y otras pruebas buscan
// los de la navegación por subcadena. "Bitácora 123" hacía que encontraran dos.

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
    // T037: el aviso de error lleva su ícono, no solo el color.
    await expectErrorIcon(page.locator('ui-error-state'));
    // El aviso no invita ni destruye: "Reintentar" es secundario. La acción principal de la vista
    // ("Nuevo producto") queda fuera del aviso, y su caso es el de "pantalla: catálogo" (T029).
    await expectAccent(page, null, { selector: 'ui-error-state' });
    await expectDeclaredPairs(page, { selector: 'ui-error-state' });
    await expectDestructive(page, [], { selector: 'ui-error-state' });
  });
});

// T025: el diálogo de confirmación. Sus cinco usos son destructivos, así que el caso usa uno, el de
// salir con cambios sin guardar, que se abre desde cualquier editor.
test('pantalla: diálogo: confirmación', async ({ page }) => {
  const { url } = await productAsOwner(`DS-Confirmación ${Date.now()}`);
  await page.goto(url);
  await signIn(page, OWNER);
  await page.getByLabel('Nombre', { exact: true }).fill('Nombre a medio escribir');
  await page.getByRole('link', { name: '← Catálogo', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Hay cambios sin guardar', exact: true })).toBeVisible();

  // Destructiva sin acento (contracts/primary-actions.md, caso 3): el fondo de error, y nada más con él.
  await expectAccent(page, null, 'dialog');
  await expectDeclaredPairs(page, 'dialog');
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
  await expectDeclaredPairs(page);
  await expectDestructive(page, []);
  await expectPlanes(page, 'page-card');
  await expectTypeHierarchy(page);
});

test('pantalla: crear cuenta', async ({ page }) => {
  await page.goto('/signup');
  await expect(page.getByRole('heading', { level: 1, name: 'Crear cuenta' })).toBeVisible();
  await expectAccent(page, 'Crear cuenta');
  await expectDeclaredPairs(page);
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
  await expectDeclaredPairs(page);
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
    await expectDeclaredPairs(page);
    await expectDestructive(page, []);
    await expectPlanes(page, 'page-card');
    await expectTypeHierarchy(page);
  });

  // Los estados son excluyentes: si la cuenta ya es miembro, el acento pasa a "Entrar al comercio".
  test('ya es miembro: el acento es "Entrar al comercio"', async ({ page }) => {
    const email = `doble-${Date.now()}@t1.test`;
    const [first, second] = [await invitation(email), await invitation(email)];
    await signUpFromLink(page, first, email, 'Doble');
    await page.getByRole('button', { name: 'Aceptar invitación', exact: true }).click();
    await expect(page).toHaveURL(/\/t\/t1\/catalog$/);
    await page.goto(second);
    await page.getByRole('button', { name: 'Aceptar invitación', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Entrar al comercio', exact: true })).toBeVisible();
    await expectAccent(page, 'Entrar al comercio');
    await expectDeclaredPairs(page);
  });

  // Con otra cuenta, lo único que queda es "Cerrar sesión", que es secundaria: ningún acento.
  test('de otra cuenta: sin acento', async ({ page }) => {
    const link = await invitation(`otra-${Date.now()}@t1.test`);
    await page.goto('/login');
    await signIn(page, OWNER);
    await expect(page).toHaveURL(/\/t\/t1\/catalog$/);
    await page.goto(link);
    await page.getByRole('button', { name: 'Aceptar invitación', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeVisible();
    await expectAccent(page, null);
    await expectDeclaredPairs(page);
    await expectDestructive(page, []);
  });
});

// T029: el catálogo. El acento es "Nuevo producto", haya productos o no: "Crear producto" del estado vacío
// es confirmación de sección, y el acento no cambia de lugar (contracts/primary-actions.md).
test.describe('pantalla: catálogo', () => {
  test('con productos, y con la barra de selección abierta, el único acento es "Nuevo producto"', async ({ page }) => {
    await productAsOwner(`DS-Listado ${Date.now()}`);
    await page.goto('/login');
    await signIn(page, OWNER);
    await expect(page.getByRole('heading', { level: 1, name: 'Catálogo' })).toBeVisible();
    await expect(page.locator('ui-skeleton')).toHaveCount(0);
    await expectAccent(page, 'Nuevo producto');
    await expectDeclaredPairs(page);
    await expectDestructive(page, []);
    await expectPlanes(page, 'page-card-bar');
    await expectTypeHierarchy(page);

    // "Asignar" y "Agregar a la sección" son confirmaciones de sección: no suman acento.
    await page.getByRole('checkbox', { name: /^Seleccionar «/ }).first().check();
    await expect(page.getByRole('group', { name: 'Acción sobre los seleccionados', exact: true })).toBeVisible();
    await expectAccent(page, 'Nuevo producto');
    await expectDeclaredPairs(page);
  });

  test('vacío: el acento sigue en "Nuevo producto", no en "Crear producto"', async ({ page }) => {
    await page.goto('/login');
    await signIn(page, MULTI);
    await page.getByRole('link', { name: /Comercio Dos/ }).click();
    await expect(page.getByText('Todavía no hay productos', { exact: true })).toBeVisible();
    await expectAccent(page, 'Nuevo producto');
    await expectDeclaredPairs(page);
    await expectPlanes(page, 'page-card-bar');
  });

  // T030, historia 1, escenario 2: sin `catalog.write` no hay acción principal, así que no hay acento.
  test('sin permiso de escritura: ningún acento', async ({ page }) => {
    // Depende de T102 de la 001: si catalog.read sale del enumerado, usar un rol sin permisos.
    const email = await readOnlyCollaborator(`sin-acento-${Date.now()}`);
    await productAsOwner(`DS-Solo lectura ${Date.now()}`);
    await page.goto('/login');
    await signIn(page, email);
    await expect(page.getByRole('heading', { level: 1, name: 'Catálogo' })).toBeVisible();
    await expect(page.locator('main ul li').first()).toBeVisible();
    await expectAccent(page, null);
    await expectDeclaredPairs(page);
    await expectDestructive(page, []);
  });
});

test('pantalla: diálogo: nuevo producto', async ({ page }) => {
  await page.goto('/login');
  await signIn(page, OWNER);
  await page.getByRole('button', { name: 'Nuevo producto', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Nuevo producto', exact: true })).toBeVisible();
  await expectAccent(page, 'Crear', 'dialog');
  await expectDeclaredPairs(page, 'dialog');
  await expectDestructive(page, [], 'dialog');
});

// T031: el editor de producto. Sin acción principal: se edita por partes, y cada sección se confirma
// con su propio "Guardar", en primario. "Archivar producto" es la única destructiva.
test('pantalla: producto', async ({ page }) => {
  const { url } = await productAsOwner(`DS-Editor ${Date.now()}`);
  await page.goto(url);
  await signIn(page, OWNER);
  await expect(page.getByRole('group', { name: /^Única/ })).toBeVisible();
  await expect(page.locator('ui-skeleton')).toHaveCount(0);
  await expectAccent(page, null);
  await expectDeclaredPairs(page);
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
  await expectDeclaredPairs(page);
});

// T032: los diálogos de las variantes. "Confirmar" es la tarea del primero; el de imágenes no tiene
// acción principal: cada imagen se guarda por su cuenta y "Listo" solo cierra.
test('pantalla: diálogo: qué valor tiene cada variante', async ({ page }) => {
  const { url } = await productAsOwner(`DS-Asignar ${Date.now()}`);
  await page.goto(url);
  await signIn(page, OWNER);
  const only = page.getByRole('group', { name: /^Única/ });
  const sku = only.getByLabel(/^SKU/);
  await sku.fill(`SKU-${Date.now()}`);
  await sku.press('Tab');
  await expect(only).not.toContainText('Falta el SKU');
  await page.getByRole('button', { name: 'Agregar opción', exact: true }).click();
  const option = page.getByRole('group', { name: 'Opción nueva', exact: true });
  await option.getByLabel('Nombre de la opción', { exact: true }).fill('Color');
  const color = page.getByRole('group', { name: 'Color', exact: true });
  await color.getByLabel('Valor 1', { exact: true }).fill('Rojo');
  await page.getByRole('button', { name: 'Guardar opciones', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '¿Qué valor tiene cada variante?', exact: true })).toBeVisible();
  await expectAccent(page, 'Confirmar', 'dialog');
  await expectDeclaredPairs(page, 'dialog');
  await expectDestructive(page, [], 'dialog');
});

test('pantalla: diálogo: imágenes de una variante', async ({ page }) => {
  const { url } = await productAsOwner(`DS-Imágenes ${Date.now()}`);
  await page.goto(url);
  await signIn(page, OWNER);
  await page.getByRole('group', { name: /^Única/ }).getByRole('button', { name: 'Imágenes de Única (0)', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Imágenes de Única', exact: true })).toBeVisible();
  await expectAccent(page, null, 'dialog');
  await expectDeclaredPairs(page, 'dialog');
  await expectDestructive(page, [], 'dialog');
});

// T033: categorías. "Crear categoría" es la tarea de la vista; en cada fila, "Guardar", "Mover" y
// "Ocultar" son confirmaciones de sección, y "Eliminar", destructiva.
test.describe('pantalla: categorías', () => {
  async function withCategory(page: Page): Promise<string> {
    const name = `Diseño ${Date.now()}`;
    await call(await idTokenOf(OWNER), 'createCategory', { tenantId: 't1', requestId: crypto.randomUUID(), parentId: null, name });
    await page.goto('/login');
    await signIn(page, OWNER);
    await page.goto('/t/t1/categories');
    await expect(page.getByRole('button', { name: `Acciones de «${name}»`, exact: true })).toBeVisible();
    // "Crear categoría" está deshabilitado hasta que hay un nombre, y deshabilitado no lleva el acento
    // (FR-025): el acento se mide con la acción disponible.
    await page.locator('[data-field="newName"]').fill(`Nueva ${Date.now()}`);
    await expect(page.getByRole('button', { name: 'Crear categoría', exact: true })).toBeEnabled();
    return name;
  }

  test('el único acento es "Crear categoría", con planos y jerarquía', async ({ page }) => {
    await withCategory(page);
    await expectAccent(page, 'Crear categoría');
    await expectDeclaredPairs(page);
    await expectDestructive(page, []);
    await expectPlanes(page, 'page-card-bar');
    await expectTypeHierarchy(page);
  });

  test('una fila en edición no agrega acento, y al eliminar el destructivo es solo "Eliminar"', async ({ page }) => {
    const name = await withCategory(page);
    const row = page.locator('li', { has: page.getByRole('button', { name: `Acciones de «${name}»`, exact: true }) }).first();
    await page.getByRole('button', { name: `Acciones de «${name}»`, exact: true }).click();
    await page.getByRole('menuitem', { name: 'Renombrar', exact: true }).click();
    await expect(row.getByRole('button', { name: 'Guardar', exact: true })).toBeVisible();
    await expectAccent(page, 'Crear categoría');
    await expectDeclaredPairs(page);
    await row.getByRole('button', { name: 'Cancelar', exact: true }).click();

    await page.getByRole('button', { name: `Acciones de «${name}»`, exact: true }).click();
    await page.getByRole('menuitem', { name: 'Eliminar', exact: true }).click();
    await expect(row.getByRole('button', { name: 'Eliminar', exact: true })).toBeEnabled();
    await expectAccent(page, 'Crear categoría');
    await expectDeclaredPairs(page);
    await expectDestructive(page, ['Eliminar']);
  });

  // T055: el snack-bar flota sobre la vista, así que su elevación es la de lo superpuesto (FR-011), y su
  // radio, un paso de la escala (FR-012). Material dibuja una sombra propia, fuera del catálogo.
  test('el aviso al crear es un snack-bar con la elevación de lo superpuesto y el radio pequeño', async ({ page }) => {
    await withCategory(page);
    await page.getByRole('button', { name: 'Crear categoría', exact: true }).click();
    const surface = page.locator('.mat-mdc-snackbar-surface');
    await expect(surface).toBeVisible();
    const [actual, expected] = await surface.evaluate((element) => {
      const probe = document.body.appendChild(document.createElement('div'));
      probe.style.boxShadow = 'var(--ds-elevation-overlay)';
      probe.style.borderRadius = 'var(--ds-radius-sm)';
      const read = (target: Element) => ({ shadow: getComputedStyle(target).boxShadow, radius: getComputedStyle(target).borderTopLeftRadius });
      const values = [read(element), read(probe)] as const;
      probe.remove();
      return values;
    });
    expect(expected.shadow, 'la sonda resuelve el token').not.toBe('none');
    expect(actual).toEqual(expected);
  });
});

// T034: equipo y rol. "Invitar" es la tarea del equipo; "Crear rol" es confirmación de sección.
test('pantalla: equipo', async ({ page }) => {
  await page.goto('/login');
  await signIn(page, OWNER);
  await page.goto('/t/t1/team');
  await expect(page.getByRole('heading', { level: 2, name: 'Roles' })).toBeVisible();
  await expectAccent(page, 'Invitar');
  await expectDeclaredPairs(page);
  await expectDestructive(page, []);
  await expectPlanes(page, 'page-card-bar');
  await expectTypeHierarchy(page);
});

// Se abre y se cancela: traspasar de verdad cambiaría la siembra que comparten todas las pruebas.
test('pantalla: diálogo: traspaso de propiedad', async ({ page }) => {
  await page.goto('/login');
  await signIn(page, OWNER);
  await page.goto('/t/t1/team');
  await page.getByRole('button', { name: 'Hacer Propietario', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: /^¿Hacer Propietario a / });
  await expect(dialog).toBeVisible();
  await expectAccent(page, null, 'dialog');
  await expectDeclaredPairs(page, 'dialog');
  await expectDestructive(page, ['Traspasar la propiedad'], 'dialog');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('pantalla: rol', async ({ page }) => {
  // Un rol propio y sin personas: el predefinido no se edita, y con personas "Eliminar rol" se deshabilita.
  const { body } = await call(await idTokenOf(OWNER), 'createRole', { tenantId: 't1', name: `Diseño ${Date.now()}` });
  const { roleId } = (body.result as { data: { roleId: string } }).data;
  await page.goto('/login');
  await signIn(page, OWNER);
  await page.goto(`/t/t1/team/roles/${roleId}`);
  await expect(page.getByRole('button', { name: 'Eliminar rol', exact: true })).toBeEnabled();
  // "Guardar rol" aparece con cambios: el acento se mide con la acción a la vista.
  await page.getByRole('checkbox').first().click();
  await expect(page.getByRole('button', { name: 'Guardar rol', exact: true })).toBeVisible();
  await expectAccent(page, 'Guardar rol');
  await expectDeclaredPairs(page);
  await expectDestructive(page, ['Eliminar rol']);
  await expectPlanes(page, 'page-card-bar');
  await expectTypeHierarchy(page);
});

// T035: la bitácora, de solo lectura: sin acción principal ni destructivas. Es la vista más densa en
// texto, así que su caso mira también que cada entrada sea una fila del sistema.
test('pantalla: bitácora', async ({ page }) => {
  const { productId, variantId } = await productAsOwner(`DS-Registro ${Date.now()}`);
  await call(await idTokenOf(OWNER), 'setVariantPrice', { tenantId: 't1', productId, changes: [{ variantId, version: 1, price: { amount: 52000, currency: 'COP' } }] });
  await page.goto('/login');
  await signIn(page, OWNER);
  await page.goto('/t/t1/audit');
  const entries = page.getByRole('list', { name: 'Entradas de la bitácora', exact: true });
  await expect(entries.getByRole('listitem').first()).toBeVisible();
  await expectAccent(page, null);
  await expectDeclaredPairs(page);
  await expectDestructive(page, []);
  await expectPlanes(page, 'page-card-bar');
  await expectTypeHierarchy(page);
  expect(await entries.getByRole('listitem').evaluateAll((rows) => rows.filter((row) => !row.classList.contains('ds-table-row')).length)).toBe(0);
});

// T058: el estado presionado, con la onda en su pico, medido sin carrera. Cada botón tiene que conservar
// el objetivo de diseño (5,0, WCAG + 0,5) sobre el plano en que se usa. El valor queda en el reporte.
test.describe('estado presionado', () => {
  const PRESSED_TARGET = 5;
  const measure = async (page: Page, name: string, button: ReturnType<Page['locator']>) => {
    const ratio = await pressedContrast(page, button);
    test.info().annotations.push({ type: 'presionado', description: `${name}: ${ratio}` });
    console.log(`presionado ${name} [${test.info().project.name}]: ${ratio}`);
    expect(ratio, `${name} presionado`).toBeGreaterThanOrEqual(PRESSED_TARGET);
  };

  test('catálogo: el acento, un enlace de la barra y un botón de texto sobre la selección', async ({ page }) => {
    await productAsOwner(`DS-Presionado ${Date.now()}`);
    await page.goto('/login');
    await signIn(page, OWNER);
    await expect(page.getByRole('heading', { level: 1, name: 'Catálogo', exact: true })).toBeVisible();
    await expect(page.locator('ui-skeleton')).toHaveCount(0);
    await measure(page, 'Nuevo producto (acento)', page.getByRole('button', { name: 'Nuevo producto', exact: true }));
    await measure(page, 'Categorías (texto sobre la barra)', page.getByRole('link', { name: 'Categorías', exact: true }));
    await page.getByRole('checkbox', { name: /^Seleccionar «/ }).first().check();
    await measure(page, 'Mostrar el precio (texto sobre la selección)', page.getByRole('button', { name: 'Mostrar el precio', exact: true }));
  });

  test('editor y diálogo: destructivo, confirmación de sección, texto sobre la tarjeta y sobre el diálogo', async ({ page }) => {
    const { url } = await productAsOwner(`DS-Presionado ${Date.now()}`);
    await page.goto(url);
    await signIn(page, OWNER);
    await expect(page.getByRole('group', { name: /^Única/ })).toBeVisible();
    await measure(page, 'Archivar producto (destructivo)', page.getByRole('button', { name: 'Archivar producto', exact: true }));
    await page.getByLabel('Nombre', { exact: true }).fill(`Editado ${Date.now()}`);
    await measure(page, 'Guardar datos (primario)', page.getByRole('button', { name: 'Guardar datos', exact: true }));
    await measure(page, 'Descartar cambios (texto sobre la tarjeta)', page.getByRole('button', { name: 'Descartar cambios', exact: true }).first());
    await page.goto('/t/t1/catalog');
    await page.getByRole('button', { name: 'Nuevo producto', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo producto', exact: true });
    await expect(dialog).toBeVisible();
    await measure(page, 'Cancelar (texto sobre el diálogo)', dialog.getByRole('button', { name: 'Cancelar', exact: true }));
  });

  test('aviso de error: "Reintentar" en el color del aviso', async ({ page, context }) => {
    await page.goto('/login');
    await signIn(page, OWNER);
    await expect(page.getByRole('heading', { level: 1, name: 'Catálogo', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Categorías', exact: true }).click();
    await expect(page).toHaveURL(/\/t\/t1\/categories$/);
    await context.setOffline(true);
    await page.getByRole('link', { name: 'Catálogo', exact: true }).click();
    const failure = page.getByRole('alert').filter({ hasText: 'No pudimos cargar el catálogo' });
    await expect(failure).toBeVisible({ timeout: 15_000 });
    await measure(page, 'Reintentar (en el aviso de error)', failure.getByRole('button', { name: 'Reintentar', exact: true }));
  });
});

// T036 (FR-023): el anillo de foco de dos tonos (técnica C40). Con el teclado, un control sobre cada plano
// —página, tarjeta, barra y diálogo— y la acción principal (fondo de acento) tienen el trazo claro
// (`outline`) y el oscuro (`box-shadow`) con sus anchos. En colores forzados queda el `outline`.
test.describe('foco', () => {
  /** Lo que el navegador computa para el anillo de `target` con foco de teclado, y los valores de los tokens. */
  async function ring(page: Page, target: ReturnType<Page['locator']>) {
    await page.keyboard.press('Shift');
    await target.focus();
    // Un botón `filled` de Material anima su sombra (280 ms): se mide el anillo ya puesto, no a mitad.
    await target.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined))));
    return target.evaluate((element) => {
      const probe = document.body.appendChild(document.createElement('div'));
      probe.style.color = 'var(--ds-focus-ring-inner)';
      probe.style.backgroundColor = 'var(--ds-focus-ring-outer)';
      const inner = getComputedStyle(probe).color;
      const outer = getComputedStyle(probe).backgroundColor;
      const read = (token: string) => getComputedStyle(document.documentElement).getPropertyValue(token).trim();
      probe.remove();
      const style = getComputedStyle(element);
      return {
        focusVisible: element.matches(':focus-visible'),
        outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
        offset: style.outlineOffset,
        shadow: style.boxShadow,
        expected: {
          outline: `solid ${read('--ds-focus-ring-width')} ${inner}`,
          offset: read('--ds-focus-ring-offset'),
          spread: `${Number.parseFloat(read('--ds-focus-ring-offset')) + Number.parseFloat(read('--ds-focus-ring-width')) + Number.parseFloat(read('--ds-focus-ring-outer-width'))}px`,
          outer,
        },
      };
    });
  }

  async function expectTwoTone(page: Page, name: string, target: ReturnType<Page['locator']>) {
    const found = await ring(page, target);
    expect(found.focusVisible, `${name}: foco de teclado`).toBe(true);
    expect(found.outline, `${name}: trazo claro`).toBe(found.expected.outline);
    expect(found.offset, `${name}: separación`).toBe(found.expected.offset);
    expect(found.shadow, `${name}: trazo oscuro`).toContain(found.expected.outer);
    expect(found.shadow, `${name}: ancho del trazo oscuro`).toContain(`0px 0px 0px ${found.expected.spread}`);
  }

  // Los campos de Material no llevan `outline`: su foco es la línea activa, en primario y más gruesa
  // (contracts/component-treatments.md, "Campo de formulario"). El anillo es de todo lo demás.
  test('sobre la página, la tarjeta, la barra, el acento y un diálogo', async ({ page }) => {
    const { url } = await productAsOwner(`DS-Foco ${Date.now()}`);
    await page.goto(url);
    await signIn(page, OWNER);
    await expect(page.getByRole('group', { name: /^Única/ })).toBeVisible();
    await expectTwoTone(page, 'página (← Catálogo)', page.getByRole('link', { name: '← Catálogo', exact: true }));
    await page.getByRole('link', { name: '← Catálogo', exact: true }).click();
    await expect(page.locator('ui-skeleton')).toHaveCount(0);
    await expectTwoTone(page, 'tarjeta (un producto)', page.locator('ul.ds-card a').first());
    await expectTwoTone(page, 'barra (Categorías)', page.getByRole('link', { name: 'Categorías', exact: true }));
    await expectTwoTone(page, 'acento (Nuevo producto)', page.getByRole('button', { name: 'Nuevo producto', exact: true }));
    await page.getByRole('button', { name: 'Nuevo producto', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo producto', exact: true });
    await expect(dialog).toBeVisible();
    await expectTwoTone(page, 'diálogo (Cancelar)', dialog.getByRole('button', { name: 'Cancelar', exact: true }));
  });

  // T062: dentro de un campo de Material el foco es la línea del campo, no el anillo. El anillo se dibujaba
  // alrededor del control nativo, dentro del campo, y cruzaba la etiqueta flotante. No basta con que la
  // línea exista: su color computado tiene que contrastar 3:1 (WCAG 1.4.11) con el fondo del campo tal
  // como se ve con foco, es decir con la capa de foco de Material compuesta encima.
  async function fieldFocus(page: Page, control: ReturnType<Page['locator']>) {
    await page.keyboard.press('Shift');
    await control.focus();
    const field = control.locator('xpath=ancestor::mat-form-field[1]');
    await field.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined))));
    return field.evaluate((element, focused) => {
      const parse = (value: string): [number, number, number, number] => {
        const [r = 0, g = 0, b = 0, a = 1] = (value.match(/-?[\d.]+/g) ?? []).map(Number);
        return [r, g, b, a];
      };
      const over = (top: [number, number, number, number], bottom: [number, number, number], alpha: number): [number, number, number] =>
        [0, 1, 2].map((i) => (top[i] ?? 0) * top[3] * alpha + (bottom[i] ?? 0) * (1 - top[3] * alpha)) as [number, number, number];
      const luminance = (rgb: readonly number[]) =>
        rgb.map((c) => c / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((sum, c, i) => sum + c * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
      const container = element.querySelector('.mdc-text-field--filled') as HTMLElement;
      const overlay = element.querySelector('.mat-mdc-form-field-focus-overlay') as HTMLElement;
      const line = getComputedStyle(element.querySelector('.mdc-line-ripple') as Element, '::after').borderBottomColor;
      let background = parse(getComputedStyle(container).backgroundColor).slice(0, 3) as [number, number, number];
      background = over(parse(getComputedStyle(overlay).backgroundColor), background, Number(getComputedStyle(overlay).opacity));
      const [l1 = 0, l2 = 0] = [luminance(parse(line).slice(0, 3)), luminance(background)].sort((a, b) => b - a);
      const control = focused as HTMLElement;
      const style = getComputedStyle(control);
      return {
        focusVisible: control.matches(':focus-visible'),
        ring: style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0 ? `outline ${style.outlineWidth}` : style.boxShadow !== 'none' ? `sombra ${style.boxShadow}` : 'ninguno',
        line,
        ratio: Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100,
      };
    }, await control.elementHandle());
  }

  test('en un campo de Material, el foco es la línea del campo a 3:1 sobre su fondo, sin anillo', async ({ page }) => {
    const { url } = await productAsOwner(`DS-Campo ${Date.now()}`);
    await page.goto(url);
    await signIn(page, OWNER);
    const only = page.getByRole('group', { name: /^Única/ });
    await expect(only).toBeVisible();

    const name = await fieldFocus(page, page.getByLabel('Nombre', { exact: true }));
    expect(name.focusVisible, 'Nombre: foco de teclado').toBe(true);
    expect(name.ring, 'Nombre: sin anillo dentro del campo').toBe('ninguno');
    expect(name.ratio, `Nombre: la línea ${name.line} contra el fondo del campo`).toBeGreaterThanOrEqual(3);

    // Con error, la línea es la del error.
    const sku = only.getByLabel('SKU', { exact: true });
    await sku.fill(`SKU-${Date.now()}`);
    await sku.press('Enter');
    await expect(only).not.toContainText('Falta el SKU');
    await sku.fill('');
    await sku.press('Enter');
    await expect(only.locator('mat-error')).toHaveText('El SKU no se puede quitar');
    const error = await fieldFocus(page, sku);
    expect(error.ring, 'SKU con error: sin anillo dentro del campo').toBe('ninguno');
    expect(error.ratio, `SKU con error: la línea ${error.line} contra el fondo del campo`).toBeGreaterThanOrEqual(3);
  });

  test('en colores forzados el anillo conserva el trazo', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/login');
    // T062: en colores forzados el sistema reemplaza el color de la línea y quita las sombras, y Material le
    // quita el `outline` al control. El foco del campo es entonces el de Material: un contorno discontinuo de
    // 3 px alrededor del campo entero. Estilo y ancho juntos: con `outline: none`, Chrome sigue reportando
    // el ancho ("none 3px").
    const email = page.getByLabel('Correo', { exact: true });
    const wrapper = email.locator('xpath=ancestor::mat-form-field[1]').locator('.mat-mdc-text-field-wrapper');
    const outlineOf = () => wrapper.evaluate((element) => `${getComputedStyle(element).outlineStyle} ${getComputedStyle(element).outlineWidth}`);
    const ringWidth = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ds-focus-ring-width').trim());
    // Sin foco, Material ya dibuja el borde del campo con `outline`; con foco lo cambia y lo engrosa.
    const resting = await outlineOf();
    await page.keyboard.press('Shift');
    await email.focus();
    const focused = await outlineOf();
    expect(focused, 'campo en colores forzados: el foco cambia el contorno').not.toBe(resting);
    expect(focused.split(' ')[0], 'campo con foco en colores forzados: hay contorno').not.toBe('none');
    expect(focused.split(' ')[1], 'campo con foco en colores forzados: del ancho del anillo').toBe(ringWidth);
    await signIn(page, OWNER);
    await expect(page.getByRole('heading', { level: 1, name: 'Catálogo', exact: true })).toBeVisible();
    await expect(page.locator('ui-skeleton')).toHaveCount(0);
    const found = await ring(page, page.getByRole('button', { name: 'Nuevo producto', exact: true }));
    expect(found.focusVisible).toBe(true);
    // El color lo pone el sistema; el ancho tiene que ser el del anillo. Sin él, Chrome dibuja su propio
    // indicador de reserva (1 px), y "hay un trazo" no distinguiría uno de otro.
    const [style, width] = found.outline.split(' ');
    expect(style).toBe('solid');
    expect(width).toBe(found.expected.outline.split(' ')[1]);
  });
});

// T037 (FR-024): el error de un campo se ve con texto, color e ícono.
test('error con ícono: un SKU que no se puede quitar', async ({ page }) => {
  const { url } = await productAsOwner(`DS-Error ${Date.now()}`);
  await page.goto(url);
  await signIn(page, OWNER);
  const row = page.getByRole('group', { name: /^Única/ });
  const sku = row.getByLabel('SKU', { exact: true });
  await sku.fill(`SKU-${Date.now()}`);
  await sku.press('Enter');
  await expect(row).not.toContainText('Falta el SKU');
  await sku.fill('');
  await sku.press('Enter');
  const error = row.locator('mat-error');
  await expect(error).toHaveText('El SKU no se puede quitar');
  await expectErrorIcon(error);
});

// T038 (FR-025): deshabilitado se distingue por más que el color, no recibe foco y no hace nada. Nunca
// usa el tono de error ni su borde.
test('deshabilitado: "Cambiar estado" junto a "Archivar producto"', async ({ page }) => {
  const { url } = await productAsOwner(`DS-Deshabilitado ${Date.now()}`);
  await page.goto(url);
  await signIn(page, OWNER);
  const change = page.getByRole('button', { name: 'Cambiar estado', exact: true });
  const archive = page.getByRole('button', { name: 'Archivar producto', exact: true });
  await expect(change).toBeDisabled();
  await expect(archive).toBeEnabled();

  const look = (target: typeof change) =>
    target.evaluate((element) => {
      const probe = document.body.appendChild(document.createElement('div'));
      probe.style.color = 'var(--ds-text-disabled)';
      probe.style.backgroundColor = 'var(--ds-status-error)';
      probe.style.borderColor = 'var(--ds-action-destructive)';
      const [disabledText, error, destructive] = [getComputedStyle(probe).color, getComputedStyle(probe).backgroundColor, getComputedStyle(probe).borderColor];
      probe.remove();
      const style = getComputedStyle(element);
      const label = getComputedStyle(element.querySelector('.mdc-button__label') ?? element);
      return { cursor: style.cursor, opacity: style.opacity, label: label.color, background: style.backgroundColor, border: style.borderTopColor, disabledText, error, destructive };
    });
  const [disabled, enabled] = [await look(change), await look(archive)];
  expect(disabled.cursor, 'el cursor dice que no se puede').toBe('not-allowed');
  expect(disabled.cursor).not.toBe(enabled.cursor);
  expect(disabled.label, 'el texto en el color de deshabilitado').toBe(disabled.disabledText);
  expect([disabled.label, disabled.background, disabled.border]).not.toContain(disabled.error);
  expect([disabled.label, disabled.background, disabled.border]).not.toContain(disabled.destructive);

  // Sin foco: desde "Archivar producto", Shift+Tab no se detiene en "Cambiar estado".
  await archive.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(change).not.toBeFocused();
  // Y un clic no hace nada: el estado del producto sigue igual.
  await change.click({ force: true });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.status')).toContainText('Borrador');
});

// T039 (FR-013): en colores forzados el sistema quita los fondos, y lo que separa un plano de otro es el
// borde. La tarjeta, la barra y los campos tienen que conservar uno visible.
test.describe('colores forzados', () => {
  async function borders(page: Page, selectors: Record<string, string>) {
    return page.evaluate((entries) => {
      const found: Record<string, string> = {};
      for (const [name, selector] of Object.entries(entries)) {
        const element = document.querySelector(selector.replace(/::before$/, ''));
        if (!element) {
          found[name] = 'no está';
          continue;
        }
        // `selector::before` mide el pseudo-elemento: la línea activa de un campo de Material es un borde ahí.
        const style = selector.endsWith('::before') ? getComputedStyle(element, '::before') : getComputedStyle(element);
        const sides = (['Top', 'Right', 'Bottom', 'Left'] as const).filter((side) => style.getPropertyValue(`border-${side.toLowerCase()}-style`) !== 'none' && Number.parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0);
        found[name] = sides.length ? `borde en ${sides.length} lados` : 'sin borde';
      }
      return found;
    }, selectors);
  }

  test('catálogo y editor: la tarjeta, la barra y los campos conservan su borde', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    const { url } = await productAsOwner(`DS-Forzados ${Date.now()}`);
    await page.goto('/login');
    await signIn(page, OWNER);
    // El catálogo cargado, no la página de inicio de sesión, que tampoco tiene esqueleto.
    await expect(page.getByRole('heading', { level: 1, name: 'Catálogo', exact: true })).toBeVisible();
    await expect(page.locator('ui-skeleton')).toHaveCount(0);
    // El límite de un campo `fill` es su línea activa: sin fondo, es lo que lo marca.
    const catalog = await borders(page, { tarjeta: '.ds-card', barra: '.ds-bar', campo: '.mdc-line-ripple::before' });
    await page.goto(url);
    await expect(page.getByRole('group', { name: /^Única/ })).toBeVisible();
    const editor = await borders(page, { tarjeta: '.ds-card', barra: '.ds-bar', campo: '.mdc-line-ripple::before' });
    for (const [where, found] of Object.entries({ catalog, editor })) {
      for (const [name, value] of Object.entries(found)) expect(value, `${where}: ${name}`).not.toMatch(/sin borde|no está/);
    }
  });
});

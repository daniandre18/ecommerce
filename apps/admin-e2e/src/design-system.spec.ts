import { expect, test } from '@playwright/test';
import { expectAccent, expectBackground, expectDestructive, expectPlanes, expectTypeHierarchy } from './design-system-support';
import { OWNER, productAsOwner, signIn } from './support';

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

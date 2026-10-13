import { expect, test } from '@playwright/test';
import { expectAccent, expectBackground, expectDestructive } from './design-system-support';
import { OWNER, signIn } from './support';

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

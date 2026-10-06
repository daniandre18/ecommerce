import { expect, test, type Page } from '@playwright/test';
import { call, CATALOG, EMULATORS, idTokenOf, OWNER, productAsOwner, signIn } from './support';

type Section = 'featured' | 'offers';

/** Un sufijo por corrida y por proyecto: los recorridos no chocan entre sí ni con corridas viejas. */
const runId = () => `${test.info().project.name}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const documents = `${EMULATORS.firestore}/v1/projects/demo-ecommerce/databases/(default)/documents/tenants/t1`;
/** El emulador acepta `Bearer owner` como acceso de administración: lee sin pasar por las reglas. */
const admin = { Authorization: 'Bearer owner' };

/** Las dos listas del documento de secciones, tal como están ahora. */
async function sectionsNow(): Promise<Record<Section, string[]>> {
  const doc = (await (await fetch(`${documents}/storefront/sections`, { headers: admin })).json()) as {
    fields?: Record<string, { arrayValue?: { values?: { stringValue: string }[] } }>;
  };
  const list = (name: Section) => (doc.fields?.[name]?.arrayValue?.values ?? []).map((value) => value.stringValue);
  return { featured: list('featured'), offers: list('offers') };
}

/** Deja la sección con exactamente estos productos, por las callable, como lo haría el panel. */
async function sectionWith(section: Section, productIds: string[]): Promise<void> {
  const owner = await idTokenOf(OWNER);
  const current = (await sectionsNow())[section];
  if (current.length > 0) await call(owner, 'removeFromSection', { tenantId: 't1', section, productIds: current });
  if (productIds.length > 0) {
    const { body } = await call(owner, 'addToSection', { tenantId: 't1', section, productIds });
    expect(body.result).toEqual(expect.objectContaining({ ok: true }));
  }
}

/** `n` productos nuevos, creados por la callable. */
async function products(prefix: string, n: number): Promise<{ productId: string; url: string; name: string }[]> {
  const created = [];
  for (let i = 0; i < n; i++) {
    const name = `${prefix} ${String(i).padStart(2, '0')}`;
    created.push({ ...(await productAsOwner(name)), name });
  }
  return created;
}

const box = (page: Page, field: string) => page.locator(`[data-field="${field}"] input[type="checkbox"]`);

// T082 — Historia 3, pasos 1 a 6 de quickstart.md, con la Propietaria y con el rol de Catálogo.
test.describe('cómo se ofrece cada producto', () => {
  test('el precio visible es una decisión de precio: la Propietaria lo cambia y deja entrada; Catálogo no (FR-003, FR-032)', async ({ page, browser }) => {
    const run = runId();
    const { productId, url } = await productAsOwner(`Mate ${run}`);

    await test.step('1. la Propietaria oculta el precio y queda en la bitácora', async () => {
      await page.goto(url);
      await signIn(page, OWNER);
      await box(page, 'priceVisible').uncheck();
      await page.getByRole('button', { name: 'Guardar condiciones' }).click();
      await expect(page.getByText('Condiciones de venta guardadas')).toBeVisible();
      await page.goto(`/t/t1/audit?product=${productId}&type=sale-conditions.changed`);
      const entries = page.getByRole('listitem').filter({ hasText: 'Condiciones de venta: precio en la tienda' });
      await expect(entries).toHaveCount(1);
      await expect(entries.first()).toContainText('Precio oculto');
    });

    await test.step('2. el rol de Catálogo las ve en solo lectura', async () => {
      const other = await browser.newContext();
      const catalog = await other.newPage();
      await catalog.goto(url);
      await signIn(catalog, CATALOG);
      await expect(box(catalog, 'priceVisible')).not.toBeChecked();
      await expect(box(catalog, 'priceVisible')).toBeDisabled();
      await expect(box(catalog, 'freeShipping')).toBeDisabled();
      await expect(catalog.getByText('Las cambia quien puede modificar precios')).toBeVisible();
      await other.close();
    });

    await test.step('2. por fuera del panel, permission-denied y queda el evento de seguridad', async () => {
      const { body } = await call(await idTokenOf(CATALOG), 'setSaleConditions', { tenantId: 't1', changes: [{ productId, version: 2 }], priceVisible: true });
      expect(body.error?.status).toBe('PERMISSION_DENIED');
      const events = (await (await fetch(`${documents}/securityEvents?pageSize=300`, { headers: admin })).json()) as {
        documents?: { fields: { kind: { stringValue: string }; detail: { mapValue: { fields: { operation: { stringValue: string } } } } } }[];
      };
      const denied = (events.documents ?? []).filter(
        (event) => event.fields.kind.stringValue === 'permission-denied' && event.fields.detail.mapValue.fields.operation.stringValue === 'setSaleConditions',
      );
      expect(denied.length).toBeGreaterThan(0);
    });
  });

  test('Ofertas hasta 40: el contador a la vista y el 41 rechazado sin sacar a nadie (FR-027a, FR-027b)', async ({ page }) => {
    const run = runId();
    const filled = await products(`Oferta ${run}`, 39);
    await sectionWith(
      'offers',
      filled.map((p) => p.productId),
    );
    const [fortieth, extra] = await products(`Última ${run}`, 2);
    if (!fortieth || !extra) throw new Error('faltan productos');

    await page.goto(fortieth.url);
    await signIn(page, OWNER);

    await test.step('3. el 40 entra, con el contador "40 de 40"', async () => {
      await expect(page.locator('app-presentation-section .section').filter({ hasText: 'Ofertas' })).toContainText('39 de 40');
      await box(page, 'offers').check();
      await page.getByRole('button', { name: 'Guardar secciones' }).click();
      await expect(page.locator('app-presentation-section .section').filter({ hasText: 'Ofertas' })).toContainText('40 de 40');
    });

    await test.step('3. con la sección completa, el 41 no se ofrece; por fuera, se rechaza y nadie sale', async () => {
      await page.goto(extra.url);
      await expect(box(page, 'offers')).toBeDisabled();
      await expect(page.getByText('Ofertas está completa')).toBeVisible();
      const { body } = await call(await idTokenOf(OWNER), 'addToSection', { tenantId: 't1', section: 'offers', productIds: [extra.productId] });
      expect(body.result).toEqual(expect.objectContaining({ ok: false, code: 'section-full', details: { section: 'offers', remaining: 0, requested: 1 } }));
      const offers = (await sectionsNow()).offers;
      expect(offers).toHaveLength(40);
      expect(offers).toEqual([...filled.map((p) => p.productId), fortieth.productId]);
    });

    await test.step('3. el listado filtrado por Ofertas muestra el contador', async () => {
      await page.goto('/t/t1/catalog');
      await page.getByLabel('Mostrar').selectOption('offers');
      await expect(page.getByText('Ofertas: 40 de 40')).toBeVisible();
    });
  });

  test('con 35 en Destacados, agregar 8 en una acción se rechaza entera (FR-027b, FR-029)', async ({ page }) => {
    const run = runId();
    const filled = await products(`Destacado ${run}`, 35);
    await sectionWith(
      'featured',
      filled.map((p) => p.productId),
    );
    const eight = await products(`Nuevo ${run}`, 8);

    await page.goto('/t/t1/catalog');
    await signIn(page, OWNER);
    for (const { name } of eight) await page.getByRole('checkbox', { name: `Seleccionar «${name}»` }).check();
    await expect(page.getByText('8 seleccionados')).toBeVisible();
    await page.locator('[data-field="bulkSection"]').selectOption('featured');
    await page.getByRole('button', { name: 'Agregar a la sección' }).click();
    await expect(page.getByText('Destacados no tiene lugar para los 8: quedan 5 lugares. No se agregó ninguno.')).toBeVisible();
    expect((await sectionsNow()).featured).toEqual(filled.map((p) => p.productId));
  });

  test('archivar uno que está en Destacados lo avisa y libera su lugar (FR-028)', async ({ page }) => {
    const run = runId();
    const [kept, archived] = await products(`Gorro ${run}`, 2);
    if (!kept || !archived) throw new Error('faltan productos');
    await sectionWith('featured', [kept.productId, archived.productId]);

    await page.goto(archived.url);
    await signIn(page, OWNER);
    await page.getByRole('button', { name: 'Archivar producto' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Sale de Destacados, y libera su lugar.');
    await dialog.getByRole('button', { name: 'Archivar producto' }).click();
    await expect(page).toHaveURL(/\/t\/t1\/catalog$/);
    await expect(page.locator('[data-field="attribute"] option[value="featured"]')).toHaveText('En Destacados (1 de 40)');
    expect((await sectionsNow()).featured).toEqual([kept.productId]);
  });

  test('envío gratis a 20 con 3 digitales: se rechaza nombrándolos, y se reintenta sin ellos (FR-029, FR-032)', async ({ page }) => {
    const run = runId();
    const twenty = await products(`Lote ${run}`, 20);
    const owner = await idTokenOf(OWNER);
    const digital = twenty.slice(0, 3);
    for (const { productId } of digital) await call(owner, 'setProductType', { tenantId: 't1', productId, version: 1, kind: 'digital' });

    await page.goto('/t/t1/catalog');
    await signIn(page, OWNER);

    await test.step('6. el rechazo nombra los 3 digitales', async () => {
      for (const { name } of twenty) await page.getByRole('checkbox', { name: `Seleccionar «${name}»` }).check();
      await expect(page.getByText('20 seleccionados')).toBeVisible();
      await page.getByRole('button', { name: 'Activar envío gratis' }).click();
      const failure = page.locator('app-bulk-actions [role="alert"]');
      for (const { name } of digital) await expect(failure).toContainText(`«${name}»`);
      await expect(failure).toContainText('son digitales');
    });

    await test.step('6. quitarlos de la selección y reintentar, desde la misma pantalla: 17 con envío gratis y 17 entradas', async () => {
      await page.getByRole('button', { name: 'Quitar de la selección y reintentar' }).click();
      // La selección se vacía al terminar: la barra de acciones desaparece.
      await expect(page.locator('app-bulk-actions')).toHaveCount(0);
      const query = await fetch(`${documents}:runQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...admin },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'auditLog' }],
            where: { fieldFilter: { field: { fieldPath: 'type' }, op: 'EQUAL', value: { stringValue: 'sale-conditions.changed' } } },
          },
        }),
      });
      const ids = new Set(twenty.slice(3).map((p) => p.productId));
      const entries = ((await query.json()) as { document?: { fields: { field: { stringValue: string }; entity: { mapValue: { fields: { id: { stringValue: string } } } } } } }[])
        .map((row) => row.document)
        .filter((doc) => doc && doc.fields.field.stringValue === 'shipping' && ids.has(doc.fields.entity.mapValue.fields.id.stringValue));
      expect(entries).toHaveLength(17);
    });
  });
});

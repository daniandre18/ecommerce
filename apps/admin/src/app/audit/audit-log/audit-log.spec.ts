import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { AuditPage } from '@ecommerce/application';
import {
  auditEntryId,
  buildAuditEntries,
  createIncompleteVariant,
  money,
  optionId,
  productId,
  uid,
  valueId,
  variantId,
  type AuditEntry,
} from '@ecommerce/domain';
import { AUDIT_QUERIES, CATALOG_QUERIES, TEAM_QUERIES } from '../../core/client';
import { CATALOG_ACCESS, FakeAuditQueries, FakeCatalogQueries, FakeTeamQueries, member, only, product, provideAccess, T1, useAccess } from '../../../testing/fakes';
import { settle } from '../../../testing/settle';
import { AuditLog, PAGE_SIZE } from './audit-log';

const AT = new Date('2026-09-30T12:00:00Z');
const color = { id: optionId('color'), name: 'Color', position: 0, values: [{ id: valueId('rojo'), label: 'Rojo', position: 0 }] };

/** Un cambio de precio de `who` sobre la variante roja de la camiseta. */
const priceChange = (id: string, who: string, amount: number): AuditEntry =>
  only(
    buildAuditEntries(
      { tenantId: T1, uid: uid(who), name: who === 'ana' ? 'Ana' : 'Beto' },
      [{ type: 'price.changed', field: 'price', productId: productId('p1'), variantId: variantId('v1'), before: null, after: money(amount, 'COP') }],
      { batchId: null, at: AT, newEntryId: () => auditEntryId(id) },
    ),
  );

/** Una página; con `more`, sigue después de su última entrada. */
const page = (entries: AuditEntry[], more = false): AuditPage => {
  const last = entries.at(-1);
  return { entries, next: more && last ? { at: AT, id: last.id } : null };
};

// T085 — la bitácora con sus filtros, esqueleto, error y vacío (FR-034, SC-012).
describe('AuditLog', () => {
  let audit: FakeAuditQueries;
  let team: FakeTeamQueries;
  let catalog: FakeCatalogQueries;

  beforeEach(() => {
    audit = new FakeAuditQueries();
    team = new FakeTeamQueries();
    catalog = new FakeCatalogQueries();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 't/:tenantId/audit', component: AuditLog }], withComponentInputBinding()),
        provideAccess(),
        { provide: AUDIT_QUERIES, useValue: audit },
        { provide: TEAM_QUERIES, useValue: team },
        { provide: CATALOG_QUERIES, useValue: catalog },
      ],
    });
  });

  async function open(url = '/t/t1/audit') {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await settle();
    const root = harness.routeNativeElement as HTMLElement;
    const button = (text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
    const select = (label: string) => {
      const field = [...root.querySelectorAll('mat-form-field')].find((f) => f.querySelector('mat-label')?.textContent?.trim() === label);
      const control = field?.querySelector('select');
      if (!control) throw new Error(`No hay filtro ${label}`);
      return control;
    };
    return { root, button, select };
  }

  it('mientras llega la primera página muestra un esqueleto, y después cada entrada con sus nombres', async () => {
    const { root } = await open();
    expect(audit.requests.map((r) => r.filter)).toEqual([{}]);
    expect(root.querySelector('ui-skeleton')).not.toBeNull();

    team.members[0]?.emit([member('ana', 'Ana', 'catalog'), member('beto', 'Beto', 'catalog')]);
    audit.last.respond(page([priceChange('e2', 'beto', 52000), priceChange('e1', 'ana', 50000)]));
    await settle();
    catalog.products[0]?.emit(product('p1', 'Camiseta', { options: [color] }));
    catalog.variantLists[0]?.emit([{ ...createIncompleteVariant({ id: variantId('v1'), tenantId: T1, productId: productId('p1'), optionValues: { [color.id]: valueId('rojo') } }), version: 1 }]);
    await settle();

    const [first] = root.querySelectorAll('app-entry-detail');
    expect(first?.querySelector('.what')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Cambio de precio · Camiseta · Rojo');
    expect(first?.querySelector('.who')?.textContent).toContain('Beto');
    const values = [...(first?.querySelectorAll('dl div') ?? [])].map((pair) => [pair.querySelector('dt')?.textContent, pair.querySelector('dd')?.textContent]);
    expect(values).toEqual([
      ['Antes', 'Sin precio'],
      ['Después', '52.000 COP'],
    ]);
    expect(root.querySelector('app-entry-detail a')?.getAttribute('href')).toBe('/t/t1/catalog/p1');
  });

  it('los filtros salen de la dirección, y "hasta" incluye el día entero', async () => {
    await open('/t/t1/audit?actor=beto&type=stock.adjusted&from=2026-09-01&to=2026-09-30');
    expect(audit.last.filter).toEqual({
      actorUid: 'beto',
      type: 'stock.adjusted',
      from: new Date(2026, 8, 1),
      to: new Date(2026, 9, 1),
    });
  });

  it('elegir una persona la lleva a la dirección y vuelve a consultar', async () => {
    const { select } = await open();
    team.members[0]?.emit([member('ana', 'Ana', 'catalog')]);
    await settle();
    const person = select('Persona');
    person.value = 'ana';
    person.dispatchEvent(new Event('change'));
    await settle();
    expect(TestBed.inject(Router).url).toBe('/t/t1/audit?actor=ana');
    expect(audit.last.filter).toEqual({ actorUid: 'ana' });
  });

  it('un rango de fechas al revés se explica y no consulta', async () => {
    const { root } = await open('/t/t1/audit?from=2026-09-30&to=2026-09-01');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('posterior');
    expect(audit.requests).toEqual([]);
  });

  it('sin entradas y sin filtros, dice que todavía no hay cambios', async () => {
    const { root } = await open();
    audit.last.respond(page([]));
    await settle();
    expect(root.querySelector('ui-empty-state')?.textContent).toContain('Todavía no hay cambios registrados');
  });

  it('sin resultados con filtros, lo distingue de "no hay" y ofrece quitarlos', async () => {
    const { root, button } = await open('/t/t1/audit?type=role.changed');
    audit.last.respond(page([]));
    await settle();
    expect(root.querySelector('ui-empty-state')?.textContent).toContain('Ninguna entrada coincide con los filtros');
    button('Quitar filtros')?.click();
    await settle();
    expect(TestBed.inject(Router).url).toBe('/t/t1/audit');
  });

  it('si falla, lo dice y el reintento vuelve a pedir', async () => {
    const { root } = await open();
    audit.last.fail(new Error('sin red'));
    await settle();
    expect(root.querySelector('ui-error-state')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('ui-error-state button')?.click();
    await settle();
    expect(audit.requests).toHaveLength(2);
  });

  it('con más entradas ofrece cargar más, desde donde terminó la página, sin perder lo que ya se ve', async () => {
    const { root, button } = await open();
    audit.last.respond(page([priceChange('e3', 'ana', 3), priceChange('e2', 'ana', 2)], true));
    await settle();
    button('Cargar más')?.click();
    await settle();
    expect(audit.last.after).toEqual({ at: AT, id: 'e2' });
    expect(audit.requests.map((r) => r.filter)).toEqual([{}, {}]);
    audit.last.respond(page([priceChange('e1', 'ana', 1)]));
    await settle();
    expect(root.querySelectorAll('app-entry-detail')).toHaveLength(3);
    expect(button('Cargar más')).toBeUndefined();
    expect(PAGE_SIZE).toBe(25);
  });

  it('filtrada por un producto, lo nombra y permite volver a todos', async () => {
    const { root, button } = await open('/t/t1/audit?product=p1');
    expect(audit.last.filter).toEqual({ productId: 'p1' });
    catalog.products[0]?.emit(product('p1', 'Camiseta'));
    catalog.variantLists[0]?.emit([]);
    await settle();
    expect(root.querySelector('.product')?.textContent).toContain('Camiseta');
    button('Ver todos los productos')?.click();
    await settle();
    expect(TestBed.inject(Router).url).toBe('/t/t1/audit');
  });

  it('a quien no es Propietario no se le muestra ni se le consulta nada (FR-015, FR-034)', async () => {
    useAccess(CATALOG_ACCESS);
    const { root } = await open();
    expect(root.textContent).toContain('Solo el Propietario consulta la bitácora');
    expect(audit.requests).toEqual([]);
    expect(team.members).toEqual([]);
  });
});

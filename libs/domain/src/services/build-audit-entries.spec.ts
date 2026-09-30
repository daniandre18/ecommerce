import { describe, expect, it } from 'vitest';
import { batchId, productId, tenantId, uid, variantId, type AuditEntryId } from '../value-objects/ids';
import { money } from '../value-objects/money';
import { stockQuantity, stockUndefined } from '../value-objects/stock-level';
import { buildAuditEntries, type AuditedChange } from './build-audit-entries';

const ACTOR = { tenantId: tenantId('t1'), uid: uid('ana'), name: 'Ana Pérez' };
const AT = new Date('2026-09-30T12:00:00Z');
const BATCH = batchId('b1');

function build(changes: AuditedChange[]) {
  let n = 0;
  return buildAuditEntries(ACTOR, changes, { batchId: BATCH, at: AT, newEntryId: () => `e${++n}` as AuditEntryId });
}

type PriceChange = Extract<AuditedChange, { type: 'price.changed' }>;

const priceChange = (variant: string): PriceChange => ({
  type: 'price.changed',
  field: 'price',
  productId: productId('p1'),
  variantId: variantId(variant),
  before: money(1000, 'USD'),
  after: money(1200, 'USD'),
});

// T036 — FR-030 y FR-031.
describe('buildAuditEntries', () => {
  it('una entrada por variante afectada, todas con el mismo batchId (FR-030)', () => {
    const entries = build([priceChange('v1'), priceChange('v2'), priceChange('v3')]);
    expect(entries).toHaveLength(3);
    expect(new Set(entries.map((e) => e.batchId))).toEqual(new Set([BATCH]));
    expect(new Set(entries.map((e) => e.id)).size).toBe(3);
  });

  it('copia al actor al momento del hecho: la entrada se lee sin resolver cuentas (FR-031)', () => {
    const [entry] = build([priceChange('v1')]);
    expect(entry).toEqual(
      expect.objectContaining({ actorUid: 'ana', actorName: 'Ana Pérez', actorKind: 'member', tenantId: 't1', at: AT }),
    );
  });

  it('registra el cambio de precio con su campo y los valores anterior y nuevo', () => {
    const [entry] = build([{ ...priceChange('v1'), field: 'cost' }]);
    expect(entry).toEqual(
      expect.objectContaining({
        type: 'price.changed',
        field: 'cost',
        entity: { kind: 'variant', id: 'v1', productId: 'p1' },
        before: money(1000, 'USD'),
        after: money(1200, 'USD'),
      }),
    );
  });

  it('registra el ajuste de stock distinguiendo "sin definir" de cero (FR-029)', () => {
    const [entry] = build([
      { type: 'stock.adjusted', productId: productId('p1'), variantId: variantId('v1'), before: stockUndefined(), after: stockQuantity(0) },
    ]);
    expect(entry).toEqual(
      expect.objectContaining({ type: 'stock.adjusted', before: { kind: 'undefined' }, after: { kind: 'quantity', value: 0 } }),
    );
  });

  it('sin cambios no hay entradas', () => {
    expect(build([])).toEqual([]);
  });
});

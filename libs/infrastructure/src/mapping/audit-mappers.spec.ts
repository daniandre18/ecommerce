import {
  auditEntryId,
  batchId,
  buildAuditEntries,
  buildTeamAuditEntry,
  money,
  productId,
  stockQuantity,
  stockUndefined,
  tenantId,
  uid,
  variantId,
  type AuditEntry,
} from '@ecommerce/domain';
import { describe, expect, it } from 'vitest';
import { auditEntryFromDoc } from './audit-mappers';

const T1 = tenantId('t1');
const AT = new Date('2026-09-30T12:00:00Z');
const actor = { tenantId: T1, uid: uid('ana'), name: 'Ana' };
const ids = (() => {
  let n = 0;
  return () => auditEntryId(`e${++n}`);
})();

/** El documento tal como lo escribe el repositorio del servidor: la entrada entera (`{ ...entry }`). */
const roundTrip = (entry: AuditEntry) => auditEntryFromDoc(entry.id, 't1', { ...entry });

// T084 — lo que el servidor escribe en la bitácora, el panel lo lee igual, tipo por tipo (FR-031).
describe('auditEntryFromDoc', () => {
  const [price, stock] = buildAuditEntries(
    actor,
    [
      { type: 'price.changed', field: 'cost', productId: productId('p1'), variantId: variantId('v1'), before: null, after: money(800, 'COP') },
      { type: 'stock.adjusted', productId: productId('p1'), variantId: variantId('v1'), before: stockUndefined(), after: stockQuantity(0) },
    ],
    { batchId: batchId('b1'), at: AT, newEntryId: ids },
  );
  const role = buildTeamAuditEntry(
    actor,
    { change: 'role.updated', entity: { kind: 'role', id: 'catalog' }, before: { roleId: 'catalog', permissions: ['catalog.read'] }, after: { roleId: 'catalog', permissions: [] } },
    { at: AT, id: ids() },
  );

  it.each([
    ['un cambio de costo, sin importe anterior', price!],
    ['un ajuste de existencias, de sin definir a cero', stock!],
    ['un cambio de permisos de un rol', role],
  ])('%s', (_label, entry) => {
    expect(roundTrip(entry)).toEqual(entry);
  });

  it('un tipo de evento desconocido no se adivina', () => {
    expect(() => auditEntryFromDoc('x', 't1', { ...role, type: 'otro' })).toThrow(/Tipo de evento desconocido/);
  });
});

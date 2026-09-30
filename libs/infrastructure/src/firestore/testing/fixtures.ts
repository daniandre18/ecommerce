import { uid, type AuditEntry, type AuditEntryId, type TenantId } from '@ecommerce/domain';

/** Entrada mínima de tipo `role.changed`, para probar la mecánica transaccional. */
export function roleChangedEntry(tenantId: TenantId, id: string): AuditEntry {
  return {
    id: id as AuditEntryId,
    tenantId,
    type: 'role.changed',
    change: 'role.assigned',
    actorUid: uid('owner'),
    actorName: 'Propietaria',
    actorKind: 'member',
    at: new Date('2026-09-30T12:00:00Z'),
    entity: { kind: 'membership', id: 'ana' },
    batchId: null,
    before: { roleId: 'catalog' },
    after: { roleId: 'pricing' },
  };
}

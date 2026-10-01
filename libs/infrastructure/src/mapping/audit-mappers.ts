import {
  auditEntryId,
  batchId,
  isPermission,
  productId,
  tenantId,
  type AuditEntity,
  type AuditEntry,
  type PlatformOperatorId,
  type PriceField,
  type RoleChangeKind,
  type RoleSnapshot,
  type Uid,
} from '@ecommerce/domain';
import { moneyFromDoc, stockFromDoc } from './catalog-mappers';
import { toDate, type DocumentData } from './document';

const PRICE_FIELDS: readonly PriceField[] = ['price', 'compareAtPrice', 'cost'];
const ENTITY_KINDS: readonly AuditEntity['kind'][] = ['variant', 'product', 'role', 'membership', 'invitation', 'tenant'];

/**
 * Una entrada como la escribió el servidor. Un tipo de evento desconocido es un error y no se
 * adivina: la bitácora se muestra como fue escrita o no se muestra.
 */
export function auditEntryFromDoc(id: string, tid: string, d: DocumentData): AuditEntry {
  const base = {
    id: auditEntryId(id),
    tenantId: tenantId(tid),
    actorUid: String(d['actorUid']) as Uid | PlatformOperatorId,
    actorName: String(d['actorName'] ?? ''),
    actorKind: d['actorKind'] === 'platform-operator' ? ('platform-operator' as const) : ('member' as const),
    at: toDate(d['at']),
    entity: entityFromDoc(d['entity']),
    batchId: d['batchId'] ? batchId(String(d['batchId'])) : null,
  };
  switch (d['type']) {
    case 'price.changed':
      return { ...base, type: 'price.changed', field: priceField(d['field']), before: moneyFromDoc(d['before']), after: moneyFromDoc(d['after']) };
    case 'stock.adjusted':
      return { ...base, type: 'stock.adjusted', before: stockFromDoc(d['before']), after: stockFromDoc(d['after']) };
    case 'role.changed':
      return { ...base, type: 'role.changed', change: String(d['change']) as RoleChangeKind, before: snapshotFromDoc(d['before']), after: snapshotFromDoc(d['after']) };
    case 'platform.action':
      return { ...base, type: 'platform.action', before: recordOrNull(d['before']), after: recordOrNull(d['after']) };
    default:
      throw new TypeError(`Tipo de evento desconocido en la entrada ${id}: ${String(d['type'])}`);
  }
}

function entityFromDoc(value: unknown): AuditEntity {
  const entity = (value ?? {}) as { kind?: unknown; id?: unknown; productId?: unknown };
  const kind = ENTITY_KINDS.find((k) => k === entity.kind);
  if (!kind) throw new TypeError(`Entidad de bitácora desconocida: ${String(entity.kind)}`);
  return { kind, id: String(entity.id), ...(typeof entity.productId === 'string' ? { productId: productId(entity.productId) } : {}) };
}

function priceField(value: unknown): PriceField {
  const field = PRICE_FIELDS.find((f) => f === value);
  if (!field) throw new TypeError(`Importe de bitácora desconocido: ${String(value)}`);
  return field;
}

/** Copia solo los campos conocidos: lo demás no se muestra porque no se sabe qué representa. */
function snapshotFromDoc(value: unknown): RoleSnapshot | null {
  if (value == null) return null;
  const d = value as Record<string, unknown>;
  const text = (key: string) => (typeof d[key] === 'string' ? { [key]: d[key] as string } : {});
  return {
    ...text('uid'),
    ...text('email'),
    ...text('roleId'),
    ...text('roleName'),
    ...text('status'),
    ...(Array.isArray(d['permissions']) ? { permissions: d['permissions'].filter(isPermission) } : {}),
    ...(typeof d['isOwner'] === 'boolean' ? { isOwner: d['isOwner'] } : {}),
  };
}

function recordOrNull(value: unknown): Readonly<Record<string, unknown>> | null {
  return value != null && typeof value === 'object' ? { ...(value as Record<string, unknown>) } : null;
}

import type { AuditEntry, Money, Permission, PriceField, ProductId, RoleSnapshot, StockLevel } from '@ecommerce/domain';
import { formatMoneyInput } from '../../catalog/shared/amount-input';
import { PERMISSION_LABELS } from '../../team/role-editor/permission-labels';

/** Cómo se lee una entrada: qué pasó, a qué, y qué había antes y qué quedó (FR-031). */
export interface EntryView {
  readonly title: string;
  /** A qué o a quién le pasó. */
  readonly subject: string;
  readonly before?: string;
  readonly after?: string;
  /** Para los cambios de permisos: lo que el rol ganó y lo que perdió. */
  readonly granted?: readonly string[];
  readonly revoked?: readonly string[];
  /** El producto, para llevar a su editor. */
  readonly productId?: ProductId;
}

/** Los nombres que la entrada no guarda: se resuelven con lo que el panel ya conoce. */
export interface EntryNames {
  /** El nombre de una persona del comercio, por su uid. */
  person(uid: string): string | undefined;
  /** "Producto · Combinación" de una variante; `undefined` si no se pudo resolver. */
  variant(productId: ProductId, variantId: string): string | undefined;
}

const PRICE_FIELDS: Readonly<Record<PriceField, { readonly title: string; readonly none: string }>> = {
  price: { title: 'Cambio de precio', none: 'Sin precio' },
  compareAtPrice: { title: 'Cambio de precio tachado', none: 'Sin precio tachado' },
  cost: { title: 'Cambio de costo', none: 'Sin costo' },
};

const money = (value: Money | null, none: string) => (value ? `${formatMoneyInput(value)} ${value.currency}` : none);
const stock = (value: StockLevel) => (value.kind === 'quantity' ? String(value.value) : 'Sin definir');
const permissionNames = (permissions: readonly Permission[]) => permissions.map((p) => PERMISSION_LABELS[p].label);

/** Lee cada tipo de evento con lo que representan sus valores, como lo declara FR-031. */
export function describeEntry(entry: AuditEntry, names: EntryNames): EntryView {
  switch (entry.type) {
    case 'price.changed': {
      const field = PRICE_FIELDS[entry.field];
      return { title: field.title, ...variantSubject(entry, names), before: money(entry.before, field.none), after: money(entry.after, field.none) };
    }
    case 'stock.adjusted':
      return { title: 'Ajuste de existencias', ...variantSubject(entry, names), before: stock(entry.before), after: stock(entry.after) };
    case 'role.changed':
      return describeTeamChange(entry, names);
    case 'platform.action':
      return { title: 'Acción del operador de la plataforma', subject: 'El comercio', before: record(entry.before), after: record(entry.after) };
  }
}

function variantSubject(entry: AuditEntry, names: EntryNames): { subject: string; productId?: ProductId } {
  const productId = entry.entity.productId;
  if (!productId) return { subject: 'Una variante' };
  return { subject: names.variant(productId, entry.entity.id) ?? 'Una variante', productId };
}

function describeTeamChange(entry: Extract<AuditEntry, { type: 'role.changed' }>, names: EntryNames): EntryView {
  const { before, after } = entry;
  const person = (snapshot: RoleSnapshot | null, uid = entry.entity.id) => names.person(snapshot?.uid ?? uid) ?? snapshot?.email ?? 'Una persona';
  const role = (snapshot: RoleSnapshot | null) => snapshot?.roleName ?? 'Un rol';
  switch (entry.change) {
    case 'role.created':
      return { title: 'Rol creado', subject: role(after), after: listOrNone(permissionNames(after?.permissions ?? [])) };
    case 'role.updated':
      return { title: 'Rol modificado', subject: role(after), ...permissionDiff(before, after), ...renamed(before, after) };
    case 'role.deleted':
      return { title: 'Rol eliminado', subject: role(before), before: listOrNone(permissionNames(before?.permissions ?? [])) };
    case 'role.assigned':
    case 'role.revoked':
      return { title: 'Cambio de rol', subject: person(null), before: role(before), after: role(after) };
    case 'membership.added':
      return { title: 'Se sumó al equipo', subject: person(after), after: role(after) };
    case 'membership.disabled':
      return { title: 'Baja del equipo', subject: person(null), before: 'Activa', after: 'De baja' };
    case 'membership.reactivated':
      return { title: 'Volvió al equipo', subject: person(null), before: 'De baja', after: 'Activa' };
    case 'ownership.transferred':
      return { title: 'Traspaso de la propiedad', subject: 'El comercio', before: person(before, before?.uid), after: person(after, after?.uid) };
    case 'invitation.sent':
      return { title: 'Invitación enviada', subject: after?.email ?? 'Una persona', after: role(after) };
    case 'invitation.revoked':
      return { title: 'Invitación revocada', subject: before?.email ?? 'Una persona' };
  }
}

/** Para un cambio de permisos interesa la diferencia, no las dos listas enteras. */
function permissionDiff(before: RoleSnapshot | null, after: RoleSnapshot | null): Pick<EntryView, 'granted' | 'revoked'> {
  const [was, now] = [before?.permissions ?? [], after?.permissions ?? []];
  const granted = permissionNames(now.filter((p) => !was.includes(p)));
  const revoked = permissionNames(was.filter((p) => !now.includes(p)));
  return { ...(granted.length > 0 ? { granted } : {}), ...(revoked.length > 0 ? { revoked } : {}) };
}

function renamed(before: RoleSnapshot | null, after: RoleSnapshot | null): Pick<EntryView, 'before' | 'after'> {
  return before?.roleName && after?.roleName && before.roleName !== after.roleName ? { before: before.roleName, after: after.roleName } : {};
}

const listOrNone = (items: readonly string[]) => (items.length > 0 ? items.join(', ') : 'Sin permisos');

function record(value: Readonly<Record<string, unknown>> | null): string {
  if (!value) return 'Sin datos';
  return Object.entries(value)
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join(', ');
}

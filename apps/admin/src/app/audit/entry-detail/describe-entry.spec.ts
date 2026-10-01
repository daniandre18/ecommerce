import {
  auditEntryId,
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
  type PriceField,
  type TeamChange,
} from '@ecommerce/domain';
import { only } from '../../../testing/fakes';
import { describeEntry, type EntryNames } from './describe-entry';

const T1 = tenantId('t1');
const AT = new Date('2026-09-30T12:00:00Z');
const actor = { tenantId: T1, uid: uid('ana'), name: 'Ana' };
const names: EntryNames = {
  person: (id) => ({ ana: 'Ana', beto: 'Beto', owner: 'Dueña' })[id],
  variant: (product, variant) => (product === 'p1' && variant === 'v1' ? 'Camiseta · Rojo' : undefined),
};

const priceEntry = (field: PriceField, before: number | null, after: number | null, variant = 'v1') =>
  only(
    buildAuditEntries(
      actor,
      [{ type: 'price.changed', field, productId: productId('p1'), variantId: variantId(variant), before: before === null ? null : money(before, 'COP'), after: after === null ? null : money(after, 'COP') }],
      { batchId: null, at: AT, newEntryId: () => auditEntryId('e1') },
    ),
  );
const team = (change: TeamChange): AuditEntry => buildTeamAuditEntry(actor, change, { at: AT, id: auditEntryId('e1') });

// T086 — cada tipo de evento muestra qué representan su valor anterior y el nuevo (FR-031).
describe('describeEntry', () => {
  it('un precio nuevo: de "sin precio" al importe, sobre la variante con su nombre', () => {
    expect(describeEntry(priceEntry('price', null, 52000), names)).toEqual({
      title: 'Cambio de precio',
      subject: 'Camiseta · Rojo',
      productId: 'p1',
      before: 'Sin precio',
      after: '52.000 COP',
    });
  });

  it.each<[PriceField, string, string]>([
    ['compareAtPrice', 'Cambio de precio tachado', 'Sin precio tachado'],
    ['cost', 'Cambio de costo', 'Sin costo'],
  ])('%s se nombra como tal y con su propia marca de vacío', (field, title, none) => {
    expect(describeEntry(priceEntry(field, 30000, null), names)).toEqual(expect.objectContaining({ title, before: '30.000 COP', after: none }));
  });

  it('una variante que ya no se puede nombrar se dice así, sin inventar', () => {
    expect(describeEntry(priceEntry('price', 1, 2, 'v-archivada'), names).subject).toBe('Una variante');
  });

  it('las existencias distinguen "sin definir" de cero (FR-029)', () => {
    const entry = only(
      buildAuditEntries(actor, [{ type: 'stock.adjusted', productId: productId('p1'), variantId: variantId('v1'), before: stockUndefined(), after: stockQuantity(0) }], {
        batchId: null,
        at: AT,
        newEntryId: () => auditEntryId('e1'),
      }),
    );
    expect(describeEntry(entry, names)).toEqual(expect.objectContaining({ title: 'Ajuste de existencias', before: 'Sin definir', after: '0' }));
  });

  it('un cambio de permisos muestra lo que el rol ganó y lo que perdió, y el nombre si cambió', () => {
    const entry = team({
      change: 'role.updated',
      entity: { kind: 'role', id: 'catalog' },
      before: { roleId: 'catalog', roleName: 'Catálogo', permissions: ['catalog.read', 'variant.stock.write'] },
      after: { roleId: 'catalog', roleName: 'Catálogo y precios', permissions: ['catalog.read', 'variant.price.write'] },
    });
    expect(describeEntry(entry, names)).toEqual({
      title: 'Rol modificado',
      subject: 'Catálogo y precios',
      granted: ['Cambiar precios'],
      revoked: ['Cambiar existencias'],
      before: 'Catálogo',
      after: 'Catálogo y precios',
    });
  });

  it('una reasignación nombra a la persona y los dos roles', () => {
    const entry = team({ change: 'role.assigned', entity: { kind: 'membership', id: 'beto' }, before: { roleId: 'catalog', roleName: 'Catálogo' }, after: { roleId: 'precios', roleName: 'Precios' } });
    expect(describeEntry(entry, names)).toEqual({ title: 'Cambio de rol', subject: 'Beto', before: 'Catálogo', after: 'Precios' });
  });

  it('una baja nombra a la persona aunque ya no esté activa, o lo dice si no se la conoce', () => {
    const disabled = (who: string) => team({ change: 'membership.disabled', entity: { kind: 'membership', id: who }, before: { status: 'active' }, after: { status: 'disabled' } });
    expect(describeEntry(disabled('beto'), names)).toEqual({ title: 'Baja del equipo', subject: 'Beto', before: 'Activa', after: 'De baja' });
    expect(describeEntry(disabled('nadie'), names).subject).toBe('Una persona');
  });

  it('un traspaso dice quién era y quién es Propietario', () => {
    const entry = team({ change: 'ownership.transferred', entity: { kind: 'tenant', id: 't1' }, before: { uid: 'owner', isOwner: true }, after: { uid: 'ana', isOwner: true } });
    expect(describeEntry(entry, names)).toEqual(expect.objectContaining({ title: 'Traspaso de la propiedad', before: 'Dueña', after: 'Ana' }));
  });

  it('una invitación nombra el correo y el rol con el que se invitó', () => {
    const entry = team({ change: 'invitation.sent', entity: { kind: 'invitation', id: 'i1' }, before: null, after: { email: 'nueva@t1.test', roleId: 'catalog', roleName: 'Catálogo' } });
    expect(describeEntry(entry, names)).toEqual({ title: 'Invitación enviada', subject: 'nueva@t1.test', after: 'Catálogo' });
  });

  it('una acción del operador muestra el estado del comercio antes y después', () => {
    const entry: AuditEntry = { ...team({ change: 'role.created', entity: { kind: 'tenant', id: 't1' }, before: null, after: null }), type: 'platform.action', actorKind: 'platform-operator', before: { status: 'active' }, after: { status: 'suspended' } };
    expect(describeEntry(entry, names)).toEqual({ title: 'Acción del operador de la plataforma', subject: 'El comercio', before: 'status: active', after: 'status: suspended' });
  });
});

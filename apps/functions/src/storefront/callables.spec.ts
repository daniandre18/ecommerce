import { createCustomRole, productId, roleId } from '@ecommerce/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { catalogCallables } from '../catalog/callables';
import { AT, callAs, callRequest, harness, httpsErrorCode, member, T1 } from '../testing/harness';
import { storefrontCallables } from './callables';

type Harness = ReturnType<typeof harness>;

// T026 — las callable de la ficha de tienda: cada una es su caso de uso detrás de la guarda.
describe('callable de la ficha de tienda', () => {
  let h: Harness;
  let storefront: ReturnType<typeof storefrontCallables>;

  beforeEach(async () => {
    h = harness();
    storefront = storefrontCallables(h.deps);
    const created = await catalogCallables(h.deps).createProduct.run(callAs('owner', { requestId: 'p1', name: 'Camiseta', description: '' }));
    if (!created.ok) throw new Error(JSON.stringify(created));
  });

  const version = () => h.t1.store.products.get(productId('p1'))?.version;

  it('el rol de Catálogo —sin permiso de precios— edita la URL, el envío y el tipo (FR-002, FR-016)', async () => {
    await expect(storefront.setProductSlug.run(callAs('ana', { productId: 'p1', version: version(), slug: 'remera' }))).resolves.toEqual(
      expect.objectContaining({ ok: true, data: expect.objectContaining({ slug: 'remera' }) }),
    );
    await expect(
      storefront.setProductShipping.run(callAs('ana', { productId: 'p1', version: version(), weightGrams: 300, dimensionsMm: { length: 3, width: 2, height: 1 } })),
    ).resolves.toEqual(expect.objectContaining({ ok: true }));
    await expect(storefront.setProductType.run(callAs('ana', { productId: 'p1', version: version(), kind: 'digital' }))).resolves.toEqual(
      expect.objectContaining({ ok: true, data: expect.objectContaining({ changes: [{ field: 'shipping', before: 'charged', after: 'none' }] }) }),
    );
  });

  it.each(['setProductSlug', 'setProductShipping', 'setProductType'] as const)(
    '%s: un miembro sin catalog.write recibe permission-denied y queda el evento',
    async (name) => {
      addReader(h);
      const code = await httpsErrorCode(storefront[name].run(callAs('lector', { productId: 'p1', version: version() })));
      expect(code).toBe('permission-denied');
      expect(h.securityEvents.events).toEqual([expect.objectContaining({ kind: 'permission-denied', actorUid: 'lector' })]);
    },
  );

  // SC-004: una cuenta que no es del comercio no opera sobre él aunque mande su id.
  it.each(['setProductSlug', 'setProductShipping', 'setProductType'] as const)(
    '%s: con el tenantId de otro comercio, permission-denied y evento cross-tenant-access',
    async (name) => {
      const code = await httpsErrorCode(
        storefront[name].run(callRequest({ auth: { uid: 'ana' }, data: { tenantId: 't2', productId: 'p1', version: 1 } })),
      );
      expect(code).toBe('permission-denied');
      expect(h.securityEvents.events).toEqual([expect.objectContaining({ kind: 'cross-tenant-access' })]);
    },
  );

  // T067 (002, Historia 3) — FR-003 y SC-002: precio visible y envío gratis son decisiones de precio.
  // El rol de Catálogo, que sí edita el catálogo, recibe permission-denied y queda el evento.
  it('setSaleConditions: el rol de Catálogo recibe permission-denied y queda el evento de seguridad', async () => {
    const code = await httpsErrorCode(storefront.setSaleConditions.run(callAs('ana', { changes: [{ productId: 'p1', version: version() }], priceVisible: false })));
    expect(code).toBe('permission-denied');
    expect(h.securityEvents.events).toEqual([expect.objectContaining({ kind: 'permission-denied', actorUid: 'ana' })]);
    expect(h.t1.store.products.get(productId('p1'))?.priceVisible).toBe(true);
  });

  it('setSaleConditions: la Propietaria oculta el precio y queda la entrada', async () => {
    const result = await storefront.setSaleConditions.run(callAs('owner', { changes: [{ productId: 'p1', version: version() }], priceVisible: false }));
    expect(result).toEqual(expect.objectContaining({ ok: true, data: expect.objectContaining({ updated: 1 }) }));
    expect(h.t1.store.audit).toEqual([expect.objectContaining({ type: 'sale-conditions.changed', field: 'price' })]);
  });

  it('setSaleConditions: con el tenantId de otro comercio, permission-denied y evento cross-tenant-access', async () => {
    const code = await httpsErrorCode(
      storefront.setSaleConditions.run(callRequest({ auth: { uid: 'owner' }, data: { tenantId: 't2', changes: [{ productId: 'p1', version: 1 }], priceVisible: false } })),
    );
    expect(code).toBe('permission-denied');
    expect(h.securityEvents.events).toEqual([expect.objectContaining({ kind: 'cross-tenant-access' })]);
  });

  it('setSaleConditions: los digitales con envío gratis viajan nombrados en la envoltura', async () => {
    const current = h.t1.store.products.get(productId('p1'));
    if (current) h.t1.store.products.set(current.id, { ...current, kind: 'digital' });
    const result = await storefront.setSaleConditions.run(callAs('owner', { changes: [{ productId: 'p1', version: version() }], freeShipping: true }));
    expect(result).toEqual(expect.objectContaining({ ok: false, code: 'digital-products', details: { productIds: ['p1'], names: ['Camiseta'] } }));
  });

  it('una URL en uso viaja en la envoltura con el producto que la tiene', async () => {
    await catalogCallables(h.deps).createProduct.run(callAs('owner', { requestId: 'p2', name: 'Remera', description: '' }));
    const result = await storefront.setProductSlug.run(callAs('owner', { productId: 'p2', version: 1, slug: 'camiseta' }));
    expect(result).toEqual(expect.objectContaining({ ok: false, code: 'slug-conflict', details: { productId: 'p1' } }));
  });

  it('un tipo desconocido se rechaza como argumento inválido, después de autorizar', async () => {
    const result = await storefront.setProductType.run(callAs('owner', { productId: 'p1', version: version(), kind: 'liquido' }));
    expect(result).toEqual(expect.objectContaining({ ok: false, code: 'invalid-argument' }));
  });
});

/** Un miembro activo, `lector`, con un rol que solo lee el catálogo. */
function addReader(h: Harness): void {
  const role = { ...createCustomRole(roleId('lector'), T1, 'Lector', AT), permissions: ['catalog.read' as const] };
  h.t1.store.roles.set(role.id, role);
  const reader = member('lector', 'lector');
  h.t1.store.members.set(reader.uid, reader);
}

import { createCustomRole, productId, roleId } from '@ecommerce/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { catalogCallables } from '../catalog/callables';
import { AT, callAs, callRequest, harness, httpsErrorCode, member, T1 } from '../testing/harness';
import { sectionCallables } from './callables';

type Harness = ReturnType<typeof harness>;

// T067 — Historia 3: las secciones destacadas son de catálogo (FR-002): `catalog.write`, sin pedir
// permiso de precios (escenario 5).
describe('callable de las secciones destacadas', () => {
  let h: Harness;
  let sections: ReturnType<typeof sectionCallables>;

  beforeEach(async () => {
    h = harness();
    sections = sectionCallables(h.deps);
    for (const id of ['p1', 'p2']) {
      const created = await catalogCallables(h.deps).createProduct.run(callAs('owner', { requestId: id, name: `Producto ${id}`, description: '' }));
      if (!created.ok) throw new Error(JSON.stringify(created));
    }
  });

  it('el rol de Catálogo —sin permiso de precios— agrega y quita, y ve el contador', async () => {
    await expect(sections.addToSection.run(callAs('ana', { section: 'featured', productIds: ['p1', 'p2'] }))).resolves.toEqual({
      ok: true,
      data: { section: 'featured', count: 2 },
    });
    await expect(sections.removeFromSection.run(callAs('ana', { section: 'featured', productIds: ['p1'] }))).resolves.toEqual({
      ok: true,
      data: { section: 'featured', count: 1 },
    });
    expect(h.t1.store.sections.featured).toEqual([productId('p2')]);
  });

  it.each(['addToSection', 'removeFromSection'] as const)('%s: un miembro sin catalog.write recibe permission-denied y queda el evento', async (name) => {
    addReader(h);
    const code = await httpsErrorCode(sections[name].run(callAs('lector', { section: 'offers', productIds: ['p1'] })));
    expect(code).toBe('permission-denied');
    expect(h.securityEvents.events).toEqual([expect.objectContaining({ kind: 'permission-denied', actorUid: 'lector' })]);
  });

  // SC-004: una cuenta que no es del comercio no opera sobre él aunque mande su id.
  it.each(['addToSection', 'removeFromSection'] as const)('%s: con el tenantId de otro comercio, permission-denied y evento cross-tenant-access', async (name) => {
    const code = await httpsErrorCode(sections[name].run(callRequest({ auth: { uid: 'ana' }, data: { tenantId: 't2', section: 'offers', productIds: ['p1'] } })));
    expect(code).toBe('permission-denied');
    expect(h.securityEvents.events).toEqual([expect.objectContaining({ kind: 'cross-tenant-access' })]);
  });

  it('sin lugar para todos, section-full viaja con los lugares que quedan', async () => {
    h.t1.store.sections = { featured: [], offers: Array.from({ length: 39 }, (_, i) => productId(`x${i}`)) };
    await expect(sections.addToSection.run(callAs('ana', { section: 'offers', productIds: ['p1', 'p2'] }))).resolves.toEqual(
      expect.objectContaining({ ok: false, code: 'section-full', details: { section: 'offers', remaining: 1, requested: 2 } }),
    );
  });

  it('una sección que no es de las dos se rechaza como argumento inválido', async () => {
    await expect(sections.addToSection.run(callAs('ana', { section: 'novedades', productIds: ['p1'] }))).resolves.toEqual(
      expect.objectContaining({ ok: false, code: 'invalid-argument' }),
    );
  });
});

/** Un miembro activo, `lector`, con un rol que solo lee el catálogo. */
function addReader(h: Harness): void {
  const role = { ...createCustomRole(roleId('lector'), T1, 'Lector', AT), permissions: ['catalog.read' as const] };
  h.t1.store.roles.set(role.id, role);
  const reader = member('lector', 'lector');
  h.t1.store.members.set(reader.uid, reader);
}

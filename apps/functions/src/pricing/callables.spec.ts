import type { TransactionScope, UnitOfWork } from '@ecommerce/application';
import { productId } from '@ecommerce/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogCallables } from '../catalog/callables';
import { callAs, harness, httpsErrorCode } from '../testing/harness';
import { pricingCallables } from './callables';

const usd = (amount: number) => ({ amount, currency: 'USD' });

// T052 — importes y existencias: permisos separados (FR-015, FR-016) y bitácora atómica (FR-030, FR-033).
describe('callable de importes y existencias', () => {
  let h: ReturnType<typeof harness>;
  let pricing: ReturnType<typeof pricingCallables>;
  let variantId: string;

  beforeEach(async () => {
    h = harness();
    pricing = pricingCallables(h.deps);
    const created = await catalogCallables(h.deps).createProduct.run(callAs('owner', { requestId: 'p1', name: 'Camiseta', description: '' }));
    if (!created.ok) throw new Error('No se pudo crear el producto');
    variantId = created.data.variantId;
  });

  const version = () => h.t1.store.variantsOf(productId('p1'))[0]?.version;
  const priceCall = (user: string) => callAs(user, { productId: 'p1', changes: [{ variantId, version: version(), price: usd(1000) }] });

  it('la Propietaria cambia el precio y queda una entrada de bitácora del mismo lote', async () => {
    const result = await pricing.setVariantPrice.run(priceCall('owner'));
    expect(result).toEqual({ ok: true, data: expect.objectContaining({ updated: 1 }) });
    expect(h.t1.store.audit).toEqual([expect.objectContaining({ type: 'price.changed', field: 'price' })]);
  });

  describe('el rol de Catálogo (FR-016)', () => {
    it('no modifica precios', async () => {
      expect(await httpsErrorCode(pricing.setVariantPrice.run(priceCall('ana')))).toBe('permission-denied');
    });

    it('no modifica el costo', async () => {
      const call = callAs('ana', { productId: 'p1', changes: [{ variantId, cost: usd(400) }] });
      expect(await httpsErrorCode(pricing.setVariantCost.run(call))).toBe('permission-denied');
    });

    it('sí ajusta existencias, y el ajuste queda en la bitácora', async () => {
      const call = callAs('ana', { productId: 'p1', changes: [{ variantId, version: version(), stock: { kind: 'quantity', value: 0 } }] });
      await expect(pricing.setVariantStock.run(call)).resolves.toEqual({ ok: true, data: expect.objectContaining({ updated: 1 }) });
      expect(h.t1.store.audit).toEqual([expect.objectContaining({ type: 'stock.adjusted', actorUid: 'ana' })]);
    });
  });

  it('un lote de más de 100 cambios vuelve como limit-exceeded (FR-025)', async () => {
    const changes = Array.from({ length: 101 }, (_, i) => ({ variantId: `v${i}`, version: 1, price: usd(1) }));
    await expect(pricing.setVariantPrice.run(callAs('owner', { productId: 'p1', changes }))).resolves.toEqual(
      expect.objectContaining({ ok: false, code: 'limit-exceeded' }),
    );
  });

  // FR-033 con dobles; contra Firestore, en atomicity.integration.spec.ts.
  it('si la bitácora no puede escribirse, vuelve audit-write-failed y el precio no cambia', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failingAudit: UnitOfWork = {
      run: (work) => h.t1.run((tx: TransactionScope) => work({ ...tx, audit: { append: () => Promise.reject(new Error('bitácora caída')) } })),
    };
    pricing = pricingCallables({ ...h.deps, unitOfWorkFor: () => failingAudit });

    await expect(pricing.setVariantPrice.run(priceCall('owner'))).resolves.toEqual(
      expect.objectContaining({ ok: false, code: 'audit-write-failed' }),
    );
    expect(h.t1.store.variantsOf(productId('p1'))[0]?.price).toBeNull();
    expect(h.t1.store.audit).toEqual([]);
  });
});

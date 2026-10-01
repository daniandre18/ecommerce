import { money, stockQuantity, stockUndefined, type AuditEntryId, type VariantId } from '@ecommerce/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { CreateProduct } from './create-product';
import { SetVariantCost, SetVariantPrice, SetVariantStock } from './set-variant-amounts';
import { SetVariantSku } from './set-variant-sku';
import { failureOf, pid, setup, vid } from './testing/fixture';

const usd = (amount: number) => money(amount, 'USD');

// T050 — FR-015, FR-028, FR-029, FR-030, FR-031, FR-033.
describe('importes y existencias', () => {
  let t: ReturnType<typeof setup>;
  let productId: ReturnType<typeof pid>;
  let variantId: VariantId;

  beforeEach(async () => {
    t = setup();
    ({ productId, variantId } = await t.run(new CreateProduct(t.deps), { name: 'Camiseta', description: '' }));
    await t.run(new SetVariantSku(), { productId, variantId, version: 1, sku: 'CAM-01' });
  });

  const version = () => t.variant(productId, variantId).version;

  describe('SetVariantPrice', () => {
    const setPrice = () => new SetVariantPrice(t.deps);

    it('aplica precio y comparativo, con una entrada de bitácora por campo cambiado', async () => {
      const result = await t.run(setPrice(), {
        productId,
        changes: [{ variantId, version: version(), price: usd(1000), compareAtPrice: usd(1500) }],
      });

      expect(t.variant(productId, variantId)).toEqual(expect.objectContaining({ price: usd(1000), compareAtPrice: usd(1500) }));
      expect(result.updated).toBe(1);
      expect(t.uow.store.audit.map((e) => [e.type, 'field' in e ? e.field : null])).toEqual([
        ['price.changed', 'price'],
        ['price.changed', 'compareAtPrice'],
      ]);
      expect(new Set(t.uow.store.audit.map((e) => e.batchId))).toEqual(new Set([result.batchId]));
      expect(t.uow.store.audit[0]).toEqual(expect.objectContaining({ actorUid: 'ana', actorName: 'Ana Pérez', before: null, after: usd(1000) }));
    });

    it('un valor que no cambia no genera entrada ni reescribe la variante', async () => {
      await t.run(setPrice(), { productId, changes: [{ variantId, version: version(), price: usd(1000) }] });
      const before = version();
      const result = await t.run(setPrice(), { productId, changes: [{ variantId, version: before, price: usd(1000) }] });
      expect(result.updated).toBe(0);
      expect(version()).toBe(before);
      expect(t.uow.store.audit).toHaveLength(1);
    });

    it('una moneda distinta de la del comercio → invalid-argument, nada aplicado', async () => {
      const failure = await failureOf(t.run(setPrice(), { productId, changes: [{ variantId, version: version(), price: money(1000, 'COP') }] }));
      expect(failure?.code).toBe('invalid-argument');
      expect(t.variant(productId, variantId).price).toBeNull();
      expect(t.uow.store.audit).toEqual([]);
    });

    it('en una edición masiva, una versión desactualizada impide aplicar TODAS (FR-030)', async () => {
      const failure = await failureOf(
        t.run(setPrice(), { productId, changes: [{ variantId, version: version() + 5, price: usd(1000) }] }),
      );
      expect(failure?.code).toBe('version-conflict');
      expect(t.uow.store.audit).toEqual([]);
    });

    it('más de 100 cambios en una llamada → limit-exceeded (FR-025)', async () => {
      const changes = Array.from({ length: 101 }, () => ({ variantId, version: 1, price: usd(1) }));
      expect((await failureOf(t.run(setPrice(), { productId, changes })))?.code).toBe('limit-exceeded');
    });

    it('la misma variante dos veces en un lote → invalid-argument', async () => {
      const changes = [
        { variantId, version: version(), price: usd(1) },
        { variantId, version: version(), price: usd(2) },
      ];
      expect((await failureOf(t.run(setPrice(), { productId, changes })))?.code).toBe('invalid-argument');
    });

    it('una variante que no existe → not-found, nada aplicado', async () => {
      const failure = await failureOf(t.run(setPrice(), { productId, changes: [{ variantId: vid('nada'), version: 1, price: usd(1) }] }));
      expect(failure?.code).toBe('not-found');
    });

    // FR-033, sentido 1: si la entrada de bitácora no puede escribirse, el cambio no queda.
    it('si la bitácora falla al escribir, el precio no cambia', async () => {
      await t.run(setPrice(), { productId, changes: [{ variantId, version: version(), price: usd(1000) }] });
      const taken = t.uow.store.audit[0]?.id as AuditEntryId;
      const colliding = new SetVariantPrice({ ...t.deps, ids: { next: () => taken } }); // id ya usado: la escritura falla
      await expect(t.run(colliding, { productId, changes: [{ variantId, version: version(), price: usd(2000) }] })).rejects.toThrow();
      expect(t.variant(productId, variantId).price).toEqual(usd(1000));
      expect(t.uow.store.audit).toHaveLength(1);
    });
  });

  describe('SetVariantCost (FR-015)', () => {
    it('guarda el costo en su documento aparte, no en la variante, y lo registra', async () => {
      await t.run(new SetVariantCost(t.deps), { productId, changes: [{ variantId, cost: usd(400) }] });
      expect(t.uow.store.costs.get(productId)).toEqual({ [variantId]: usd(400) });
      expect(t.variant(productId, variantId)).not.toHaveProperty('cost');
      expect(t.uow.store.audit[0]).toEqual(expect.objectContaining({ type: 'price.changed', field: 'cost', before: null, after: usd(400) }));
    });

    it('un costo que no cambia no genera entrada', async () => {
      const setCost = new SetVariantCost(t.deps);
      await t.run(setCost, { productId, changes: [{ variantId, cost: usd(400) }] });
      await t.run(setCost, { productId, changes: [{ variantId, cost: usd(400) }] });
      expect(t.uow.store.audit).toHaveLength(1);
    });
  });

  describe('SetVariantStock (FR-029)', () => {
    it('registra el paso de "sin definir" a cero como un cambio real', async () => {
      await t.run(new SetVariantStock(t.deps), { productId, changes: [{ variantId, version: version(), stock: stockQuantity(0) }] });
      expect(t.variant(productId, variantId).stock).toEqual(stockQuantity(0));
      expect(t.uow.store.audit[0]).toEqual(
        expect.objectContaining({ type: 'stock.adjusted', before: stockUndefined(), after: stockQuantity(0) }),
      );
    });

    it('una variante archivada no se ajusta', async () => {
      t.uow.store.putVariant({ ...t.variant(productId, variantId), archived: true });
      const failure = await failureOf(
        t.run(new SetVariantStock(t.deps), { productId, changes: [{ variantId, version: version(), stock: stockQuantity(3) }] }),
      );
      expect(failure?.code).toBe('invalid-argument');
    });
  });
});

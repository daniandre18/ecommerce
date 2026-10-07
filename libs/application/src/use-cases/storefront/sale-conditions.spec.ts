import type { Product } from '@ecommerce/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { CreateProduct } from '../create-product';
import { ctx, failureOf, pid, setup } from '../testing/fixture';
import { SetSaleConditions } from './set-sale-conditions';

// T064 — Historia 3: precio visible y envío gratis, en uno o en masa (FR-026, FR-029, FR-032).
describe('SetSaleConditions', () => {
  let t: ReturnType<typeof setup>;
  let set: SetSaleConditions;

  beforeEach(() => {
    t = setup();
    set = new SetSaleConditions(t.deps);
  });

  const newProduct = async (id: string, overrides: Partial<Product> = {}) => {
    await t.run(new CreateProduct(t.deps), { name: `Producto ${id}`, description: '' }, { ...ctx, requestId: id });
    if (Object.keys(overrides).length > 0) t.uow.store.products.set(pid(id), { ...t.product(id), ...overrides });
    return t.product(id);
  };
  const changes = (...ids: string[]) => ids.map((id) => ({ productId: pid(id), version: t.product(id).version }));
  const audit = () => t.uow.store.audit;

  it('ocultar el precio lo guarda con su entrada de bitácora (FR-032)', async () => {
    await newProduct('p1');
    const result = await t.run(set, { changes: changes('p1'), priceVisible: false });
    expect(t.product('p1')).toEqual(expect.objectContaining({ priceVisible: false, version: 2 }));
    expect(audit()).toEqual([
      expect.objectContaining({ type: 'sale-conditions.changed', field: 'price', before: 'shown', after: 'hidden', batchId: result.batchId }),
    ]);
    expect(result).toEqual(expect.objectContaining({ updated: 1, auditEntryIds: [audit()[0]?.id] }));
  });

  it('en masa: una entrada por producto que cambia, todas con el mismo batchId', async () => {
    for (const id of ['p1', 'p2', 'p3']) await newProduct(id);
    const { batchId } = await t.run(set, { changes: changes('p1', 'p2', 'p3'), freeShipping: true });
    expect(audit().map((e) => [e.entity.id, e.type === 'sale-conditions.changed' ? [e.field, e.before, e.after] : null, e.batchId])).toEqual([
      ['p1', ['shipping', 'charged', 'free'], batchId],
      ['p2', ['shipping', 'charged', 'free'], batchId],
      ['p3', ['shipping', 'charged', 'free'], batchId],
    ]);
  });

  it('los dos campos a la vez: dos entradas por producto', async () => {
    await newProduct('p1');
    await t.run(set, { changes: changes('p1'), priceVisible: false, freeShipping: true });
    expect(audit().map((e) => (e.type === 'sale-conditions.changed' ? e.field : null))).toEqual(['price', 'shipping']);
  });

  it('un producto que ya estaba así no cambia ni deja entrada', async () => {
    await newProduct('p1', { freeShipping: true });
    await newProduct('p2');
    const result = await t.run(set, { changes: changes('p1', 'p2'), freeShipping: true });
    expect(t.product('p1').version).toBe(1);
    expect(audit().map((e) => e.entity.id)).toEqual(['p2']);
    expect(result.updated).toBe(1);
  });

  it('quitar el envío gratis guardado de un digital no cambia lo que paga el comprador: sin entrada', async () => {
    await newProduct('p1', { kind: 'digital', freeShipping: true });
    await t.run(set, { changes: changes('p1'), freeShipping: false });
    expect(t.product('p1').freeShipping).toBe(false);
    expect(audit()).toEqual([]);
  });

  it('envío gratis con digitales seleccionados: rechaza nombrándolos y no aplica nada (FR-029)', async () => {
    await newProduct('p1');
    await newProduct('d1', { kind: 'digital' });
    await newProduct('d2', { kind: 'digital' });
    const before = [t.product('p1'), t.product('d1'), t.product('d2')];
    expect(await failureOf(t.run(set, { changes: changes('p1', 'd1', 'd2'), freeShipping: true }))).toEqual({
      code: 'digital-products',
      details: { productIds: ['d1', 'd2'], names: ['Producto d1', 'Producto d2'] },
    });
    expect([t.product('p1'), t.product('d1'), t.product('d2')]).toEqual(before);
    expect(audit()).toEqual([]);
  });

  it('ocultar el precio de un digital sí se puede', async () => {
    await newProduct('d1', { kind: 'digital' });
    await t.run(set, { changes: changes('d1'), priceVisible: false });
    expect(t.product('d1').priceVisible).toBe(false);
  });

  it('una versión vieja en un producto rechaza el lote entero', async () => {
    await newProduct('p1');
    await newProduct('p2');
    const stale = [...changes('p1'), { productId: pid('p2'), version: 99 }];
    expect(await failureOf(t.run(set, { changes: stale, priceVisible: false }))).toEqual(expect.objectContaining({ code: 'version-conflict' }));
    expect(t.product('p1').priceVisible).toBe(true);
    expect(audit()).toEqual([]);
  });

  it('hasta 100 productos por lote; vacío, repetido o sin nada que cambiar es inválido', async () => {
    await newProduct('p1');
    const many = Array.from({ length: 101 }, (_, i) => ({ productId: pid(`p${i}`), version: 1 }));
    expect(await failureOf(t.run(set, { changes: many, priceVisible: false }))).toEqual(
      expect.objectContaining({ code: 'limit-exceeded', details: { max: 100, actual: 101 } }),
    );
    expect(await failureOf(t.run(set, { changes: [], priceVisible: false }))).toEqual(expect.objectContaining({ code: 'invalid-argument' }));
    expect(await failureOf(t.run(set, { changes: [...changes('p1'), ...changes('p1')], priceVisible: false }))).toEqual(
      expect.objectContaining({ code: 'invalid-argument' }),
    );
    expect(await failureOf(t.run(set, { changes: changes('p1') }))).toEqual(expect.objectContaining({ code: 'invalid-argument' }));
  });

  it('un producto que no existe → not-found', async () => {
    expect(await failureOf(t.run(set, { changes: [{ productId: pid('nada'), version: 1 }], priceVisible: false }))).toEqual(
      expect.objectContaining({ code: 'not-found' }),
    );
  });
});

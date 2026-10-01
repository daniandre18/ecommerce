import { productId } from '@ecommerce/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { callAs, harness, httpsErrorCode } from '../testing/harness';
import { catalogCallables } from './callables';

type Harness = ReturnType<typeof harness>;

// T051 — las callable de catálogo: cada una es su caso de uso detrás de la guarda.
describe('callable de catálogo', () => {
  let h: Harness;
  let catalog: ReturnType<typeof catalogCallables>;

  beforeEach(() => {
    h = harness();
    catalog = catalogCallables(h.deps);
  });

  const data = <T>(result: { ok: boolean; data?: T }): T => {
    if (!result.ok) throw new Error(`Se esperaba ok y vino ${JSON.stringify(result)}`);
    return result.data as T;
  };

  it('el rol de Catálogo crea, estructura y publica un producto de punta a punta', async () => {
    const created = data(await catalog.createProduct.run(callAs('ana', { requestId: 'p1', name: 'Camiseta', description: '' })));
    expect(created.productId).toBe('p1');

    const options = data(
      await catalog.setProductOptions.run(
        callAs('ana', {
          productId: 'p1',
          version: 1,
          options: [{ id: 'color', name: 'Color', values: [{ id: 'rojo', label: 'Rojo' }, { id: 'azul', label: 'Azul' }] }],
        }),
      ),
    );
    const variants = [...options.preserved, ...options.created];
    expect(variants).toHaveLength(2);

    for (const [i, variantId] of variants.entries()) {
      const version = h.t1.store.variantsOf(productId('p1')).find((v) => v.id === variantId)?.version;
      data(await catalog.setVariantSku.run(callAs('ana', { productId: 'p1', variantId, version, sku: `CAM-${i}` })));
    }

    const status = await catalog.setProductStatus.run(callAs('ana', { productId: 'p1', version: options.version, status: 'active' }));
    expect(status).toEqual({ ok: true, data: { version: options.version + 1 } });
    expect(h.t1.store.products.get(productId('p1'))?.status).toBe('active');
  });

  it('reintentar la creación con el mismo requestId no duplica el producto', async () => {
    const call = callAs('ana', { requestId: 'p1', name: 'Camiseta', description: '' });
    const [first, second] = [await catalog.createProduct.run(call), await catalog.createProduct.run(call)];
    expect(second).toEqual(first);
    expect(h.t1.store.products.size).toBe(1);
  });

  it('una edición con versión vieja vuelve como version-conflict (FR-027)', async () => {
    await catalog.createProduct.run(callAs('ana', { requestId: 'p1', name: 'Camiseta', description: '' }));
    await expect(catalog.updateProductDetails.run(callAs('ana', { productId: 'p1', version: 7, name: 'Remera' }))).resolves.toEqual(
      expect.objectContaining({ ok: false, code: 'version-conflict' }),
    );
  });

  it('archivar el producto lo saca de circulación sin borrarlo (FR-023)', async () => {
    await catalog.createProduct.run(callAs('ana', { requestId: 'p1', name: 'Camiseta', description: '' }));
    await expect(catalog.archiveProduct.run(callAs('ana', { productId: 'p1', version: 1 }))).resolves.toEqual({ ok: true, data: { version: 2 } });
    expect(h.t1.store.products.get(productId('p1'))?.archived).toBe(true);
  });

  it('la última variante en circulación no se archiva sola', async () => {
    const { variantId } = data(await catalog.createProduct.run(callAs('ana', { requestId: 'p1', name: 'Camiseta', description: '' })));
    await expect(catalog.archiveVariant.run(callAs('ana', { productId: 'p1', variantId, version: 1 }))).resolves.toEqual(
      expect.objectContaining({ ok: false, code: 'invalid-argument' }),
    );
  });

  it.each(Object.keys(catalogCallables(harness().deps)))('%s exige ser miembro del comercio', async (name) => {
    const callable = catalog[name as keyof typeof catalog];
    expect(await httpsErrorCode(callable.run(callAs('desconocido', { productId: 'p1' })))).toBe('permission-denied');
    expect(h.securityEvents.events).toEqual([expect.objectContaining({ detail: expect.objectContaining({ operation: name }) })]);
  });
});

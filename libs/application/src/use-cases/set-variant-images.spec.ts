import { hasVariantData } from '@ecommerce/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { CreateProduct } from './create-product';
import { SetVariantImages } from './set-variant-images';
import { ctx, failureOf, pid, setup } from './testing/fixture';

// T060 — cada variante tiene sus propias imágenes (FR-020: también la variante implícita).
describe('SetVariantImages', () => {
  let t: ReturnType<typeof setup>;
  let variantId: string;
  const folder = 'tenants/t1/products/p1/images';

  beforeEach(async () => {
    t = setup();
    const created = await t.run(new CreateProduct(t.deps), { name: 'Taza', description: '' }, { ...ctx, requestId: 'p1' });
    variantId = created.variantId;
  });

  const setImages = (images: { storagePath: string; alt: string; position: number }[], version = 1) =>
    t.run(new SetVariantImages(), { productId: pid('p1'), variantId: t.variant('p1', variantId).id, version, images });

  it('guarda las imágenes de la variante, con su texto alternativo, y sube su versión', async () => {
    await expect(setImages([{ storagePath: `${folder}/a.png`, alt: ' Taza blanca ', position: 0 }])).resolves.toEqual({ version: 2 });
    expect(t.variant('p1', variantId).images).toEqual([{ storagePath: `${folder}/a.png`, alt: 'Taza blanca', position: 0 }]);
  });

  it('una imagen cuenta como dato: la variante ya no se descarta en silencio (FR-024)', async () => {
    await setImages([{ storagePath: `${folder}/a.png`, alt: 'Taza', position: 0 }]);
    expect(hasVariantData(t.variant('p1', variantId))).toBe(true);
  });

  it('sin texto alternativo se rechaza (FR-038a)', async () => {
    expect(await failureOf(setImages([{ storagePath: `${folder}/a.png`, alt: '  ', position: 0 }]))).toEqual(
      expect.objectContaining({ code: 'invalid-argument' }),
    );
  });

  it('una imagen de otro producto o de otro comercio se rechaza', async () => {
    for (const storagePath of ['tenants/t1/products/otro/images/a.png', 'tenants/t2/products/p1/images/a.png', `${folder}/../../otro/a.png`]) {
      expect(await failureOf(setImages([{ storagePath, alt: 'Foto', position: 0 }]))).toEqual(expect.objectContaining({ code: 'invalid-argument' }));
    }
  });

  it('con una versión vieja, version-conflict (FR-027)', async () => {
    expect(await failureOf(setImages([], 9))).toEqual(expect.objectContaining({ code: 'version-conflict' }));
  });

  it('exige catalog.write', () => {
    expect(SetVariantImages.requires).toEqual({ kind: 'permission', permission: 'catalog.write' });
  });
});

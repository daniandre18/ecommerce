import type {
  ProductRepository,
  SkuIndexRepository,
  TenantRepository,
  VariantRepository,
} from '@ecommerce/application';
import type { Transaction } from 'firebase-admin/firestore';
import {
  productFromDoc,
  productToDoc,
  skuIndexFromDoc,
  tenantFromDoc,
  variantFromDoc,
  variantToDoc,
} from '../catalog-mappers';
import type { TenantPaths } from '../tenant-paths';

export function tenantRepository(t: Transaction, paths: TenantPaths): TenantRepository {
  return {
    get: async () => {
      const snap = await t.get(paths.tenantDoc());
      const data = snap.data();
      return data ? tenantFromDoc(snap.id, data) : null;
    },
  };
}

export function productRepository(t: Transaction, paths: TenantPaths): ProductRepository {
  const products = paths.collection('products');
  return {
    findById: async (id) => {
      const snap = await t.get(products.doc(id));
      const data = snap.data();
      return data ? productFromDoc(snap.id, paths.tenantId, data) : null;
    },
    save: async (product) => {
      t.set(products.doc(product.id), productToDoc(product));
    },
    // `update` falla si el producto no existe: un resumen de variantes sin producto es un error.
    updateVariantSummary: async (id, summary) => {
      t.update(products.doc(id), { variantCount: summary.variantCount, hasIncompleteVariants: summary.hasIncompleteVariants });
    },
  };
}

export function variantRepository(t: Transaction, paths: TenantPaths): VariantRepository {
  const variantsOf = (productId: string) => paths.collection(`products/${productId}/variants`);
  return {
    findByProduct: async (productId) => {
      const snap = await t.get(variantsOf(productId));
      return snap.docs.map((doc) => variantFromDoc(doc.id, paths.tenantId, productId, doc.data()));
    },
    save: async (variant) => {
      t.set(variantsOf(variant.productId).doc(variant.id), variantToDoc(variant));
    },
    delete: async (productId, id) => {
      t.delete(variantsOf(productId).doc(id));
    },
  };
}

/** El id de cada entrada es el SKU normalizado; la unicidad por comercio sale de la ruta (FR-021). */
export function skuIndexRepository(t: Transaction, paths: TenantPaths): SkuIndexRepository {
  const index = paths.collection('skuIndex');
  return {
    find: async (normalized) => {
      const data = (await t.get(index.doc(normalized))).data();
      return data ? skuIndexFromDoc(data) : null;
    },
    // `create` falla al confirmar si el SKU ya existe: dos escrituras simultáneas no pueden tomarlo.
    reserve: async ({ sku, variantId, productId }) => {
      t.create(index.doc(sku.normalized), {
        sku: { raw: sku.raw, normalized: sku.normalized },
        variantId,
        productId,
        archived: false,
        createdAt: new Date(),
      });
    },
    release: async (normalized) => {
      t.delete(index.doc(normalized));
    },
    // `update` falla si la entrada no existe: archivar una variante cuyo SKU no está reservado
    // revelaría un índice inconsistente, y eso tiene que fallar fuerte.
    markArchived: async (normalized) => {
      t.update(index.doc(normalized), { archived: true });
    },
  };
}

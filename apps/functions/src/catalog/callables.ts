import {
  ArchiveProduct,
  ArchiveVariant,
  CreateProduct,
  SetProductOptions,
  SetProductStatus,
  SetVariantSku,
  UpdateProductDetails,
} from '@ecommerce/application';
import { callableFactory, type CallableDependencies } from '../bootstrap/callable';
import {
  parseArchiveProduct,
  parseArchiveVariant,
  parseCreateProduct,
  parseSetProductOptions,
  parseSetProductStatus,
  parseSetVariantSku,
  parseUpdateProductDetails,
} from '../bootstrap/parse';

/** Catálogo (`contracts/callable-functions.md`): ninguna escribe bitácora, todas exigen `catalog.write`. */
export function catalogCallables(deps: CallableDependencies) {
  const defineCallable = callableFactory(deps);
  return {
    createProduct: defineCallable('createProduct', CreateProduct, parseCreateProduct),
    updateProductDetails: defineCallable('updateProductDetails', UpdateProductDetails, parseUpdateProductDetails),
    setProductOptions: defineCallable('setProductOptions', SetProductOptions, parseSetProductOptions),
    setProductStatus: defineCallable('setProductStatus', SetProductStatus, parseSetProductStatus),
    setVariantSku: defineCallable('setVariantSku', SetVariantSku, parseSetVariantSku),
    archiveProduct: defineCallable('archiveProduct', ArchiveProduct, parseArchiveProduct),
    archiveVariant: defineCallable('archiveVariant', ArchiveVariant, parseArchiveVariant),
  };
}

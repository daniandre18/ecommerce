import { SetProductShipping, SetProductSlug, SetProductType, SetSaleConditions } from '@ecommerce/application';
import { callableFactory, type CallableDependencies } from '../bootstrap/callable';
import { parseSetProductShipping, parseSetProductSlug, parseSetProductType, parseSetSaleConditions } from '../bootstrap/parse';

/**
 * La ficha de tienda (`specs/002-storefront-catalog/contracts/callable-functions.md`): exigen
 * `catalog.write`, salvo las condiciones de venta, que son de precio (`variant.price.write`, FR-003).
 * El cambio de tipo y las condiciones de venta escriben sus entradas en la misma transacción (FR-032).
 */
export function storefrontCallables(deps: CallableDependencies) {
  const defineCallable = callableFactory(deps);
  return {
    setProductSlug: defineCallable('setProductSlug', SetProductSlug, parseSetProductSlug),
    setProductShipping: defineCallable('setProductShipping', SetProductShipping, parseSetProductShipping),
    setProductType: defineCallable('setProductType', SetProductType, parseSetProductType, { writesAudit: true }),
    setSaleConditions: defineCallable('setSaleConditions', SetSaleConditions, parseSetSaleConditions, { writesAudit: true }),
  };
}

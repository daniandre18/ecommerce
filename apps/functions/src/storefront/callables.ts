import { SetProductShipping, SetProductSlug, SetProductType } from '@ecommerce/application';
import { callableFactory, type CallableDependencies } from '../bootstrap/callable';
import { parseSetProductShipping, parseSetProductSlug, parseSetProductType } from '../bootstrap/parse';

/**
 * La ficha de tienda (`specs/002-storefront-catalog/contracts/callable-functions.md`): todas exigen
 * `catalog.write`. El cambio de tipo escribe además su entrada de condiciones de venta (FR-032).
 */
export function storefrontCallables(deps: CallableDependencies) {
  const defineCallable = callableFactory(deps);
  return {
    setProductSlug: defineCallable('setProductSlug', SetProductSlug, parseSetProductSlug),
    setProductShipping: defineCallable('setProductShipping', SetProductShipping, parseSetProductShipping),
    setProductType: defineCallable('setProductType', SetProductType, parseSetProductType, { writesAudit: true }),
  };
}

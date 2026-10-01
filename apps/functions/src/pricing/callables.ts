import { SetVariantCost, SetVariantPrice, SetVariantStock } from '@ecommerce/application';
import { callableFactory, type CallableDependencies } from '../bootstrap/callable';
import { parseSetVariantCost, parseSetVariantPrice, parseSetVariantStock } from '../bootstrap/parse';

/**
 * Importes y existencias: cada una con su propio permiso (FR-015) y su entrada de bitácora en la
 * misma transacción que el cambio (FR-030, FR-033).
 */
export function pricingCallables(deps: CallableDependencies) {
  const defineCallable = callableFactory(deps);
  const audited = { writesAudit: true };
  return {
    setVariantPrice: defineCallable('setVariantPrice', SetVariantPrice, parseSetVariantPrice, audited),
    setVariantCost: defineCallable('setVariantCost', SetVariantCost, parseSetVariantCost, audited),
    setVariantStock: defineCallable('setVariantStock', SetVariantStock, parseSetVariantStock, audited),
  };
}

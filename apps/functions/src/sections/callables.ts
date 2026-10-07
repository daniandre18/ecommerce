import { AddToSection, RemoveFromSection } from '@ecommerce/application';
import { callableFactory, type CallableDependencies } from '../bootstrap/callable';
import { parseSection } from '../bootstrap/parse';

/**
 * Destacados y Ofertas (`specs/002-storefront-catalog/contracts/callable-functions.md`): exigen
 * `catalog.write` y no escriben bitácora. El tope de 40 lo hace cumplir la transacción del caso de
 * uso sobre el documento de secciones, también con agregados simultáneos (SC-011).
 */
export function sectionCallables(deps: CallableDependencies) {
  const defineCallable = callableFactory(deps);
  return {
    addToSection: defineCallable('addToSection', AddToSection, parseSection),
    removeFromSection: defineCallable('removeFromSection', RemoveFromSection, parseSection),
  };
}

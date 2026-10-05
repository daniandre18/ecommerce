import type { PriceVisibility, ShippingCondition } from '../entities/audit-entry';
import type { Product } from '../entities/product';
import type { AuditedChange } from './build-audit-entries';

/** Lo único que deciden las condiciones de venta: el tipo, el envío gratis y si el precio se ve. */
export type SaleConditionsSource = Pick<Product, 'id' | 'kind' | 'freeShipping' | 'priceVisible'>;

/** El cambio auditable que produce: siempre del tipo condiciones de venta. */
export type SaleConditionsChange = Extract<AuditedChange, { type: 'sale-conditions.changed' }>;

/** Lo que ve o paga el comprador, que es lo que se audita (FR-032 de la 002). */
export interface SaleConditions {
  readonly price: PriceVisibility;
  readonly shipping: ShippingCondition;
}

/**
 * Las condiciones EFECTIVAS de un producto. Un digital no se envía aunque conserve `freeShipping`
 * guardado (FR-016): por eso se compara esto, y no los campos (research §3 de la 002).
 */
export function effectiveSaleConditions(product: SaleConditionsSource): SaleConditions {
  return {
    price: product.priceVisible ? 'shown' : 'hidden',
    shipping: product.kind === 'digital' ? 'none' : product.freeShipping ? 'free' : 'charged',
  };
}

/**
 * Los cambios auditables que produce pasar de `before` a `after`: uno por condición efectiva que
 * cambió, ninguno si no cambió ninguna. Los casos de uso escriben exactamente esto, con
 * `buildAuditEntries`, en la misma transacción que el cambio: ninguno decide con un `if` propio.
 *
 * Captura el caso que comparar campos no captura: un digital que pasa a físico sin envío gratis no
 * cambia ningún campo de envío, pero el comprador pasa de no pagar envío a pagarlo.
 */
export function saleConditionChanges(before: SaleConditionsSource, after: SaleConditionsSource): SaleConditionsChange[] {
  const from = effectiveSaleConditions(before);
  const to = effectiveSaleConditions(after);
  const changes: SaleConditionsChange[] = [];
  if (from.price !== to.price) {
    changes.push({ type: 'sale-conditions.changed', field: 'price', productId: after.id, before: from.price, after: to.price });
  }
  if (from.shipping !== to.shipping) {
    changes.push({ type: 'sale-conditions.changed', field: 'shipping', productId: after.id, before: from.shipping, after: to.shipping });
  }
  return changes;
}

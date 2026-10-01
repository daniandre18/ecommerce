import {
  MAX_COMBINATIONS,
  normalizeName,
  type AuditActor,
  type Money,
  type Product,
  type ProductId,
  type Tenant,
  type Variant,
  type VariantId,
} from '@ecommerce/domain';
import { BusinessRuleError } from '../errors';
import type { OperationContext } from '../ports/operation-context';
import type { Clock, IdGenerator } from '../ports/system';
import type { TransactionScope } from '../ports/unit-of-work';

export interface UseCaseDependencies {
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export async function loadProduct(tx: TransactionScope, id: ProductId): Promise<Product> {
  const product = await tx.products.findById(id);
  if (!product) throw new BusinessRuleError('not-found', `No existe el producto ${id}`);
  return product;
}

export async function loadTenant(tx: TransactionScope): Promise<Tenant> {
  const tenant = await tx.tenant.get();
  if (!tenant) throw new BusinessRuleError('not-found', 'No existe el comercio');
  return tenant;
}

export function findVariant(variants: readonly Variant[], id: VariantId): Variant {
  const variant = variants.find((candidate) => candidate.id === id);
  if (!variant) throw new BusinessRuleError('not-found', `No existe la variante ${id}`);
  return variant;
}

/** Una variante archivada está fuera de circulación: no se edita (FR-023). */
export function findLiveVariant(variants: readonly Variant[], id: VariantId): Variant {
  const variant = findVariant(variants, id);
  if (variant.archived) throw new BusinessRuleError('invalid-argument', `La variante ${id} está archivada`);
  return variant;
}

/**
 * Concurrencia optimista (FR-027): la versión se compara al cargar, dentro de la transacción. Si
 * otra escritura cambia el documento antes de confirmar, Firestore reintenta y esta comparación
 * falla en el reintento, en lugar de sobrescribir en silencio.
 */
export function assertVersion(entity: { readonly id: string; readonly version: number }, expected: number): void {
  if (entity.version !== expected) {
    throw new BusinessRuleError('version-conflict', `${entity.id} cambió mientras lo editabas`, {
      id: entity.id,
      expected,
      actual: entity.version,
    });
  }
}

/** Cada escritura de un producto o una variante incrementa su versión. */
export const bumped = <T extends { readonly version: number }>(entity: T): T => ({ ...entity, version: entity.version + 1 });

export function productName(raw: string): { name: string; nameNormalized: string } {
  const name = raw.trim();
  if (name === '') throw new BusinessRuleError('invalid-argument', 'El producto necesita un nombre');
  return { name, nameNormalized: normalizeName(name) };
}

/** Un lote no puede tener más cambios que variantes puede tener un producto (FR-025). */
export function assertBatch(changes: readonly { readonly variantId: VariantId }[]): void {
  if (changes.length === 0) throw new BusinessRuleError('invalid-argument', 'No hay cambios para aplicar');
  if (changes.length > MAX_COMBINATIONS) {
    throw new BusinessRuleError('limit-exceeded', `Un lote admite hasta ${MAX_COMBINATIONS} cambios`, {
      max: MAX_COMBINATIONS,
      actual: changes.length,
    });
  }
  const ids = changes.map((change) => change.variantId);
  if (new Set(ids).size !== ids.length) {
    throw new BusinessRuleError('invalid-argument', 'Una variante aparece más de una vez en el lote');
  }
}

/** Los importes van en la moneda del comercio, no en la que elija cada pedido. */
export function assertCurrency(amount: Money, tenant: Tenant): void {
  if (amount.currency !== tenant.currency) {
    throw new BusinessRuleError('invalid-argument', `El importe debe estar en ${tenant.currency}`, {
      expected: tenant.currency,
      actual: amount.currency,
    });
  }
}

export const actorOf = (ctx: OperationContext): AuditActor => ({
  tenantId: ctx.tenantId,
  uid: ctx.actorUid,
  name: ctx.actorName,
});

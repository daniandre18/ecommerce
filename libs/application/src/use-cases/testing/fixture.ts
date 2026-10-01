import {
  money,
  productId,
  tenantId,
  uid,
  variantId,
  type CurrencyCode,
  type PlatformOperatorId,
  type Product,
  type ProductId,
  type Variant,
  type VariantId,
} from '@ecommerce/domain';
import type { OperationContext } from '../../ports/operation-context';
import type { TransactionScope } from '../../ports/unit-of-work';
import { InMemoryUnitOfWork } from '../../testing/in-memory';
import type { UseCaseDependencies } from '../shared';

export const T1 = tenantId('t1');
export const NOW = new Date('2026-09-30T12:00:00Z');
export const USD = money(0, 'USD').currency as CurrencyCode;

export const ctx: OperationContext = { tenantId: T1, actorUid: uid('ana'), actorName: 'Ana Pérez', requestId: 'req-1' };

export interface UseCase<I, O> {
  execute(tx: TransactionScope, ctx: OperationContext, input: I): Promise<O>;
}

/** Un comercio sembrado, con reloj fijo e ids deterministas (`id-1`, `id-2`…). */
export function setup() {
  const uow = new InMemoryUnitOfWork();
  uow.store.tenant = {
    id: T1,
    name: 'Comercio Uno',
    ownerUid: uid('owner'),
    currency: USD,
    createdAt: NOW,
    createdBy: 'seed' as PlatformOperatorId,
    status: 'active',
  };
  let n = 0;
  const deps: UseCaseDependencies = { clock: { now: () => NOW }, ids: { next: () => `id-${++n}` } };

  const run = <I, O>(useCase: UseCase<I, O>, input: I, context: OperationContext = ctx) =>
    uow.run((tx) => useCase.execute(tx, context, input));

  const product = (id: string): Product => {
    const found = uow.store.products.get(productId(id));
    if (!found) throw new Error(`No existe el producto ${id}`);
    return found;
  };
  const variant = (product: string, id: string): Variant => {
    const found = uow.store.variantsOf(productId(product)).find((v) => v.id === id);
    if (!found) throw new Error(`No existe la variante ${product}/${id}`);
    return found;
  };
  const variantsOf = (product: string) => uow.store.variantsOf(productId(product));

  return { uow, deps, run, product, variant, variantsOf };
}

/** Código del `BusinessRuleError` con que falló la promesa, o `undefined` si no falló. */
export async function failureOf(promise: Promise<unknown>): Promise<{ code: string; details: unknown } | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    const { code, details } = error as { code?: string; details?: unknown };
    if (code === undefined) throw error;
    return { code, details };
  }
}

export const pid = (id: string): ProductId => productId(id);
export const vid = (id: string): VariantId => variantId(id);

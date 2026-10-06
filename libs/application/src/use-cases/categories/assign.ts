import { MAX_CATEGORIES_PER_PRODUCT, resolveCategories, type CategoryId, type CategoryTree, type Product, type ProductId } from '@ecommerce/domain';
import { BusinessRuleError } from '../../errors';
import { requirePermission } from '../../ports/authorization';
import type { OperationContext } from '../../ports/operation-context';
import type { TransactionScope } from '../../ports/unit-of-work';
import { loadProduct } from '../shared';
import { MAX_BULK_PRODUCTS } from './shared';

// Asignar productos a categorías (FR-022, FR-025). Son operaciones de conjunto: no comparan ni
// incrementan la versión del producto, así que dos asignaciones a la vez no se pisan y no provocan un
// conflicto a quien está editando el producto (research §2). Cada escritura de `categoryIds` parte de
// las categorías vigentes, así que descarta de paso los ids de categorías eliminadas.

export interface SetProductCategoriesInput {
  readonly productId: ProductId;
  /** Lo que agrega y lo que quita; nunca el conjunto completo, que pisaría una asignación masiva. */
  readonly add: readonly CategoryId[];
  readonly remove: readonly CategoryId[];
}

/** Las categorías de un producto, desde su editor. */
export class SetProductCategories {
  static readonly requires = requirePermission('catalog.write');

  async execute(tx: TransactionScope, _ctx: OperationContext, input: SetProductCategoriesInput): Promise<{ categoryIds: CategoryId[] }> {
    if (input.add.length === 0 && input.remove.length === 0) throw new BusinessRuleError('invalid-argument', 'No hay categorías para agregar ni quitar');
    if (input.add.some((id) => input.remove.includes(id))) {
      throw new BusinessRuleError('invalid-argument', 'Una categoría no puede agregarse y quitarse a la vez');
    }
    const tree = await tx.categories.get();
    const product = await loadProduct(tx, input.productId);
    assertExist(tree, input.add);

    const next = withChange(tree, product, input.add, input.remove);
    if (next.length > MAX_CATEGORIES_PER_PRODUCT) {
      throw new BusinessRuleError('limit-exceeded', `Un producto admite hasta ${MAX_CATEGORIES_PER_PRODUCT} categorías`, {
        max: MAX_CATEGORIES_PER_PRODUCT,
        actual: next.length,
      });
    }
    await tx.products.updateCategories(product.id, next);
    return { categoryIds: next };
  }
}

export interface BulkCategoryInput {
  readonly categoryId: CategoryId;
  readonly productIds: readonly ProductId[];
}

/** Asigna una categoría a los seleccionados, sin duplicar (FR-025). Si a uno no le entra, ninguno. */
export class AssignCategory {
  static readonly requires = requirePermission('catalog.write');

  async execute(tx: TransactionScope, _ctx: OperationContext, input: BulkCategoryInput): Promise<{ changed: number }> {
    const { tree, products } = await loadBulk(tx, input);
    const changes = products.map((product) => ({ product, next: withChange(tree, product, [input.categoryId], []) }));
    const full = changes.filter(({ next }) => next.length > MAX_CATEGORIES_PER_PRODUCT).map(({ product }) => product.id);
    if (full.length > 0) {
      throw new BusinessRuleError('limit-exceeded', `Un producto admite hasta ${MAX_CATEGORIES_PER_PRODUCT} categorías`, {
        max: MAX_CATEGORIES_PER_PRODUCT,
        productIds: full,
      });
    }
    return { changed: await write(tx, changes) };
  }
}

/** Quita una categoría a los seleccionados; a quien no la tenía no le pasa nada (FR-025). */
export class UnassignCategory {
  static readonly requires = requirePermission('catalog.write');

  async execute(tx: TransactionScope, _ctx: OperationContext, input: BulkCategoryInput): Promise<{ changed: number }> {
    const { tree, products } = await loadBulk(tx, input);
    return { changed: await write(tx, products.map((product) => ({ product, next: withChange(tree, product, [], [input.categoryId]) }))) };
  }
}

/** Las vigentes del producto, menos las que se quitan, más las que se agregan, sin repetir. */
function withChange(tree: CategoryTree, product: Product, add: readonly CategoryId[], remove: readonly CategoryId[]): CategoryId[] {
  const kept = resolveCategories(tree, product.categoryIds).filter((id) => !remove.includes(id));
  return [...new Set([...kept, ...add])];
}

function assertExist(tree: CategoryTree, ids: readonly CategoryId[]): void {
  const missing = ids.filter((id) => !tree.nodes[id]);
  if (missing.length > 0) throw new BusinessRuleError('not-found', 'Alguna de las categorías ya no existe', { categoryIds: missing });
}

async function loadBulk(tx: TransactionScope, input: BulkCategoryInput): Promise<{ tree: CategoryTree; products: Product[] }> {
  const ids = [...new Set(input.productIds)];
  if (ids.length === 0) throw new BusinessRuleError('invalid-argument', 'No hay productos seleccionados');
  if (ids.length > MAX_BULK_PRODUCTS) {
    throw new BusinessRuleError('limit-exceeded', `Una acción masiva admite hasta ${MAX_BULK_PRODUCTS} productos`, {
      max: MAX_BULK_PRODUCTS,
      actual: ids.length,
    });
  }
  // Todas las lecturas antes que cualquier escritura.
  const tree = await tx.categories.get();
  assertExist(tree, [input.categoryId]);
  const products = await Promise.all(ids.map((id) => loadProduct(tx, id)));
  return { tree, products };
}

/** Escribe solo los que cambian: un producto que ya estaba como queda no se toca. */
async function write(tx: TransactionScope, changes: readonly { product: Product; next: CategoryId[] }[]): Promise<number> {
  const changed = changes.filter(({ product, next }) => !sameList(product.categoryIds, next));
  for (const { product, next } of changed) await tx.products.updateCategories(product.id, next);
  return changed.length;
}

const sameList = (a: readonly CategoryId[], b: readonly CategoryId[]) => a.length === b.length && a.every((id, i) => id === b[i]);

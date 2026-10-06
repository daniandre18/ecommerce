import {
  CategoryHasChildrenError,
  CategoryLimitError,
  CategoryNameTakenError,
  CategoryNotFoundError,
  CategorySlugTakenError,
  InvalidCategoryNameError,
  slugify,
  type CategoryTree,
  type Slug,
} from '@ecommerce/domain';
import { BusinessRuleError } from '../../errors';
import type { TransactionScope } from '../../ports/unit-of-work';

/** Hasta cuántos productos admite una acción masiva (SC-007). */
export const MAX_BULK_PRODUCTS = 100;

/**
 * Lee el árbol, le aplica una operación del dominio y lo guarda, en la misma transacción. No hay una
 * versión global del árbol (research §1): la operación es de intención y se valida contra el árbol
 * fresco; si otra la cambió antes de confirmar, Firestore reintenta y la valida de nuevo.
 */
export async function changeTree<T>(tx: TransactionScope, change: (tree: CategoryTree) => { tree: CategoryTree; result: T }): Promise<T> {
  const before = await tx.categories.get();
  const { tree, result } = translated(() => change(before));
  if (tree !== before) await tx.categories.save(tree);
  return result;
}

/** La URL que escribió el comercio, con las mismas reglas que la generada (FR-007, FR-021). */
export function writtenSlug(raw: string): Slug {
  const value = slugify(raw);
  if (!value) throw new BusinessRuleError('invalid-argument', 'La URL necesita al menos una letra o un número');
  return value;
}

/** Los errores del árbol, con los códigos del contrato (`contracts/callable-functions.md`). */
export function translated<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof CategoryNotFoundError) throw new BusinessRuleError('not-found', error.message);
    if (error instanceof CategoryLimitError) throw new BusinessRuleError('category-limit', error.message, { reason: error.reason });
    if (error instanceof CategoryNameTakenError) throw new BusinessRuleError('category-name-taken', error.message);
    if (error instanceof CategorySlugTakenError) throw new BusinessRuleError('slug-conflict', error.message, { categoryId: error.categoryId });
    if (error instanceof CategoryHasChildrenError) throw new BusinessRuleError('category-has-children', error.message);
    if (error instanceof InvalidCategoryNameError) throw new BusinessRuleError('invalid-argument', error.message);
    throw error;
  }
}

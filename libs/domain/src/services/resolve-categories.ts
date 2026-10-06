import type { CategoryTree } from '../entities/category-tree';
import type { CategoryId } from '../value-objects/ids';

/**
 * Las categorías vigentes de un producto: las que siguen en el árbol, sin repetir y en su orden.
 * Un id de una categoría eliminada cuya poda todavía no terminó se ignora (research §2), así que
 * ningún lector depende de que la poda haya llegado a ese producto.
 */
export function resolveCategories(tree: CategoryTree, ids: readonly CategoryId[]): CategoryId[] {
  return [...new Set(ids)].filter((id) => tree.nodes[id] !== undefined);
}

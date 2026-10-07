import type { CategoryTree } from '../entities/category-tree';
import type { CategoryId } from '../value-objects/ids';

/**
 * Lo que ve la tienda de una categoría (FR-021a): oculta si ella o un ancestro lo está. `self` es
 * su propia decisión; `ancestor` nombra al ancestro más cercano que se ocultó por sí mismo, para
 * que el panel diga "oculta por su categoría padre".
 */
export type EffectiveVisibility =
  | { readonly visible: true }
  | { readonly visible: false; readonly hiddenBy: 'self' }
  | { readonly visible: false; readonly hiddenBy: 'ancestor'; readonly ancestorId: CategoryId };

const VISIBLE: EffectiveVisibility = { visible: true };
const SELF: EffectiveVisibility = { visible: false, hiddenBy: 'self' };

/**
 * Se deriva al leer, de la visibilidad propia de cada nodo y la de sus ancestros; nunca se guarda.
 * Por eso volver a mostrar un padre devuelve a cada descendiente la suya (research §1). Un
 * recorrido O(n) sobre el árbol que ya está en memoria: ninguna lectura por nivel.
 */
export function effectiveVisibility(tree: CategoryTree): ReadonlyMap<CategoryId, EffectiveVisibility> {
  const result = new Map<CategoryId, EffectiveVisibility>();
  const resolve = (id: CategoryId): EffectiveVisibility => {
    const known = result.get(id);
    if (known) return known;
    const node = tree.nodes[id];
    let visibility = VISIBLE;
    if (node?.hidden) {
      visibility = SELF;
    } else if (node?.parentId != null && tree.nodes[node.parentId]) {
      const parent = resolve(node.parentId);
      if (!parent.visible) visibility = parent.hiddenBy === 'self' ? { visible: false, hiddenBy: 'ancestor', ancestorId: node.parentId } : parent;
    }
    result.set(id, visibility);
    return visibility;
  };
  for (const id of Object.keys(tree.nodes) as CategoryId[]) resolve(id);
  return result;
}

/** Todas las subcategorías de un nodo, de todos los niveles, sin incluirlo. */
export function descendantsOf(tree: CategoryTree, id: CategoryId): CategoryId[] {
  const nodes = Object.values(tree.nodes);
  const found: CategoryId[] = [];
  const pending = [id];
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    for (const node of nodes) {
      if (node.parentId === current) {
        found.push(node.id);
        pending.push(node.id);
      }
    }
  }
  return found;
}

/** 1 para las de primer nivel. */
export function depthOf(tree: CategoryTree, id: CategoryId): 1 | 2 | 3 {
  let depth = 1;
  for (let node = tree.nodes[id]; node?.parentId != null; node = tree.nodes[node.parentId]) depth++;
  return depth as 1 | 2 | 3;
}

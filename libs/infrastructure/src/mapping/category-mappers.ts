import { categoryId, emptyCategoryTree, slug, type CategoryNode, type CategoryTree } from '@ecommerce/domain';
import type { DocumentData } from './document';

// `storefront/categoryTree`: el árbol entero en un documento (research §1 de la 002). El id de cada
// nodo es su clave en `nodes`. Cada nodo guarda solo su visibilidad PROPIA; la efectiva se deriva al
// leer con `effectiveVisibility`, nunca se guarda (FR-021a).

export function categoryTreeFromDoc(d: DocumentData | undefined): CategoryTree {
  if (!d) return emptyCategoryTree();
  const raw = (d['nodes'] ?? {}) as Record<string, DocumentData>;
  const nodes = Object.fromEntries(Object.entries(raw).map(([key, node]) => [key, nodeFromDoc(key, node)]));
  return { nodes, pendingPrune: ((d['pendingPrune'] ?? []) as unknown[]).map((value) => categoryId(String(value))) };
}

function nodeFromDoc(key: string, d: DocumentData): CategoryNode {
  const parent = d['parentId'];
  return {
    id: categoryId(key),
    name: String(d['name']),
    slug: slug(String(d['slug'])),
    parentId: parent == null ? null : categoryId(String(parent)),
    position: Number(d['position'] ?? 0),
    hidden: d['hidden'] === true,
  };
}

/** Lista cada campo: lo que no está acá no se guarda. */
export function categoryTreeToDoc(tree: CategoryTree): Record<string, unknown> {
  return {
    nodes: Object.fromEntries(
      Object.values(tree.nodes).map((n) => [
        n.id,
        { name: n.name, slug: n.slug, parentId: n.parentId, position: n.position, hidden: n.hidden },
      ]),
    ),
    pendingPrune: [...tree.pendingPrune],
  };
}

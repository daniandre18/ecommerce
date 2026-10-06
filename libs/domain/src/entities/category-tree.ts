import { depthOf, descendantsOf } from '../services/effective-visibility';
import { normalizeName } from '../services/normalize-name';
import type { CategoryId } from '../value-objects/ids';
import { nextSlugCandidate, slug, slugify, type Slug } from '../value-objects/slug';

/** Topes del árbol (FR-019 y research §1: el árbol entero vive en un documento de 1 MiB). */
export const MAX_CATEGORY_DEPTH = 3;
export const MAX_CATEGORIES = 1000;
/** Con 1.000 nodos, un nombre acotado mantiene el documento lejos de su tope de 1 MiB. */
export const MAX_CATEGORY_NAME_LENGTH = 70;

export interface CategoryNode {
  readonly id: CategoryId;
  /** Único entre hermanas, comparado sin mayúsculas ni acentos (FR-020). */
  readonly name: string;
  /** Plana y única en todo el árbol, incluidas las anteriores (FR-021). */
  readonly slug: Slug;
  /** Las que tuvo y ya no tiene: reservadas para redirigir (FR-021). */
  readonly previousSlugs: readonly Slug[];
  /** `null`: primer nivel. */
  readonly parentId: CategoryId | null;
  /** Orden entre hermanas. */
  readonly position: number;
  /**
   * Solo la visibilidad PROPIA (FR-021a). La efectiva —oculta si ella o un ancestro lo está— se
   * deriva al leer con `effectiveVisibility`; ninguna operación la copia a los descendientes.
   */
  readonly hidden: boolean;
}

/** El árbol entero de un comercio, en un solo documento (research §1). */
export interface CategoryTree {
  readonly nodes: Readonly<Record<CategoryId, CategoryNode>>;
  /** Eliminadas cuyos ids todavía pueden quedar en algún producto (research §2). */
  readonly pendingPrune: readonly CategoryId[];
}

export const emptyCategoryTree = (): CategoryTree => ({ nodes: {}, pendingPrune: [] });

export class CategoryNotFoundError extends Error {
  override readonly name = 'CategoryNotFoundError';
}

/** Profundidad, ciclo o tope de categorías (FR-019): el motivo viaja en la respuesta de la callable. */
export class CategoryLimitError extends Error {
  override readonly name = 'CategoryLimitError';

  constructor(
    readonly reason: 'depth' | 'cycle' | 'count',
    message: string,
  ) {
    super(message);
  }
}

export class CategoryNameTakenError extends Error {
  override readonly name = 'CategoryNameTakenError';
}

export class CategorySlugTakenError extends Error {
  override readonly name = 'CategorySlugTakenError';

  constructor(
    readonly slug: Slug,
    readonly categoryId: CategoryId,
  ) {
    super(`La URL ${slug} ya la usa otra categoría`);
  }
}

export class CategoryHasChildrenError extends Error {
  override readonly name = 'CategoryHasChildrenError';
}

export class InvalidCategoryNameError extends Error {
  override readonly name = 'InvalidCategoryNameError';
}

/** Las hijas de un nodo (o las de primer nivel), en su orden. */
export function childrenOf(tree: CategoryTree, parentId: CategoryId | null): CategoryNode[] {
  return Object.values(tree.nodes)
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => a.position - b.position);
}

/** De la raíz al nodo: "Ropa > Hombre > Camisetas". */
export function categoryPath(tree: CategoryTree, id: CategoryId): CategoryNode[] {
  const path: CategoryNode[] = [];
  for (let node = tree.nodes[id]; node; node = node.parentId === null ? undefined : tree.nodes[node.parentId]) path.unshift(node);
  return path;
}

/**
 * La URL que recibirá una categoría con ese nombre: la generada, o la base con el menor sufijo libre
 * (FR-021). Es la que el panel muestra antes de confirmar, y la que usa `createCategory`.
 */
export function firstFreeCategorySlug(tree: CategoryTree, name: string): Slug {
  const base = slugify(name) ?? slug('categoria');
  const used = usedSlugs(tree);
  for (let n = 1; ; n++) {
    const candidate = nextSlugCandidate(base, n);
    if (!used.has(candidate)) return candidate;
  }
}

export interface NewCategory {
  readonly id: CategoryId;
  readonly parentId: CategoryId | null;
  readonly name: string;
  /** Escrita por el comercio y ya normalizada; si falta, se genera del nombre. */
  readonly slug?: Slug;
}

export function createCategory(tree: CategoryTree, input: NewCategory): CategoryTree {
  if (tree.nodes[input.id]) throw new Error(`Ya existe la categoría ${input.id}`);
  if (Object.keys(tree.nodes).length >= MAX_CATEGORIES) {
    throw new CategoryLimitError('count', `Un comercio admite hasta ${MAX_CATEGORIES} categorías`);
  }
  if (input.parentId !== null) {
    find(tree, input.parentId);
    if (depthOf(tree, input.parentId) >= MAX_CATEGORY_DEPTH) {
      throw new CategoryLimitError('depth', `Las categorías admiten hasta ${MAX_CATEGORY_DEPTH} niveles`);
    }
  }
  const name = validName(input.name);
  assertNameFree(tree, input.parentId, name, input.id);
  const chosen = input.slug ?? firstFreeCategorySlug(tree, name);
  assertSlugFree(tree, chosen, input.id);

  const node: CategoryNode = {
    id: input.id,
    name,
    slug: chosen,
    previousSlugs: [],
    parentId: input.parentId,
    position: childrenOf(tree, input.parentId).length,
    hidden: false,
  };
  return { ...tree, nodes: { ...tree.nodes, [node.id]: node } };
}

/** No cambia la URL (FR-021): la tienda y los enlaces externos la siguen usando. */
export function renameCategory(tree: CategoryTree, id: CategoryId, rawName: string): CategoryTree {
  const node = find(tree, id);
  const name = validName(rawName);
  assertNameFree(tree, node.parentId, name, id);
  return withNode(tree, { ...node, name });
}

/** La anterior queda en `previousSlugs`, reservada; volver a una anterior propia la recupera. */
export function setCategorySlug(tree: CategoryTree, id: CategoryId, next: Slug): CategoryTree {
  const node = find(tree, id);
  if (next === node.slug) return tree;
  assertSlugFree(tree, next, id);
  const previousSlugs = [...node.previousSlugs.filter((previous) => previous !== next), node.slug];
  return withNode(tree, { ...node, slug: next, previousSlugs });
}

/**
 * Mueve un nodo, con sus hijas, al lugar `position` entre las hijas de `parentId`; con el mismo
 * padre, solo reordena. No toca el `hidden` de nadie (FR-021a): bajo un padre oculto, el nodo queda
 * oculto de hecho porque la visibilidad efectiva se deriva al leer.
 */
export function moveCategory(tree: CategoryTree, id: CategoryId, parentId: CategoryId | null, position: number): CategoryTree {
  const node = find(tree, id);
  if (parentId !== null) {
    find(tree, parentId);
    if (parentId === id || descendantsOf(tree, id).includes(parentId)) {
      throw new CategoryLimitError('cycle', 'Una categoría no puede quedar dentro de sí misma ni de sus subcategorías');
    }
    if (depthOf(tree, parentId) + heightOf(tree, id) > MAX_CATEGORY_DEPTH) {
      throw new CategoryLimitError('depth', `Con sus subcategorías quedaría a más de ${MAX_CATEGORY_DEPTH} niveles`);
    }
  }
  if (parentId !== node.parentId) assertNameFree(tree, parentId, node.name, id);

  const siblings = childrenOf(tree, parentId).filter((sibling) => sibling.id !== id);
  const at = Math.max(0, Math.min(Math.trunc(position), siblings.length));
  siblings.splice(at, 0, { ...node, parentId });
  const nodes = { ...tree.nodes };
  siblings.forEach((sibling, index) => (nodes[sibling.id] = { ...sibling, position: index }));
  return { ...tree, nodes };
}

/** Escribe solo ese nodo (FR-021a). Sus descendientes conservan cada uno su visibilidad propia. */
export function setCategoryHidden(tree: CategoryTree, id: CategoryId, hidden: boolean): CategoryTree {
  const node = find(tree, id);
  return node.hidden === hidden ? tree : withNode(tree, { ...node, hidden });
}

/**
 * Sin subcategorías (FR-024). Saca el nodo del árbol y deja su id pendiente de podar de los
 * productos; mientras tanto, todo lector lo ignora con `resolveCategories`.
 */
export function deleteCategory(tree: CategoryTree, id: CategoryId): CategoryTree {
  find(tree, id);
  if (childrenOf(tree, id).length > 0) throw new CategoryHasChildrenError('Primero hay que mover o eliminar sus subcategorías');
  const nodes = { ...tree.nodes };
  delete nodes[id];
  const pendingPrune = tree.pendingPrune.includes(id) ? tree.pendingPrune : [...tree.pendingPrune, id];
  return { nodes, pendingPrune };
}

/** Quita de las pendientes las que ya no quedan en ningún producto. */
export function completePrune(tree: CategoryTree, pruned: readonly CategoryId[]): CategoryTree {
  return { ...tree, pendingPrune: tree.pendingPrune.filter((id) => !pruned.includes(id)) };
}

function find(tree: CategoryTree, id: CategoryId): CategoryNode {
  const node = tree.nodes[id];
  if (!node) throw new CategoryNotFoundError(`No existe la categoría ${id}`);
  return node;
}

function withNode(tree: CategoryTree, node: CategoryNode): CategoryTree {
  return { ...tree, nodes: { ...tree.nodes, [node.id]: node } };
}

function validName(raw: string): string {
  const name = raw.trim();
  if (name === '') throw new InvalidCategoryNameError('La categoría necesita un nombre');
  if (name.length > MAX_CATEGORY_NAME_LENGTH) {
    throw new InvalidCategoryNameError(`El nombre de una categoría admite hasta ${MAX_CATEGORY_NAME_LENGTH} caracteres`);
  }
  return name;
}

function assertNameFree(tree: CategoryTree, parentId: CategoryId | null, name: string, self: CategoryId): void {
  const normalized = normalizeName(name);
  if (childrenOf(tree, parentId).some((sibling) => sibling.id !== self && normalizeName(sibling.name) === normalized)) {
    throw new CategoryNameTakenError(`Ya hay una categoría "${name}" en ese lugar`);
  }
}

function assertSlugFree(tree: CategoryTree, value: Slug, self: CategoryId): void {
  for (const node of Object.values(tree.nodes)) {
    if (node.id === self) continue;
    if (node.slug === value || node.previousSlugs.includes(value)) throw new CategorySlugTakenError(value, node.id);
  }
}

function usedSlugs(tree: CategoryTree): Set<Slug> {
  return new Set(Object.values(tree.nodes).flatMap((node) => [node.slug, ...node.previousSlugs]));
}

/** Niveles que ocupa la rama de un nodo, contándolo: una hoja ocupa 1. */
function heightOf(tree: CategoryTree, id: CategoryId): number {
  return 1 + Math.max(0, ...childrenOf(tree, id).map((child) => heightOf(tree, child.id)));
}

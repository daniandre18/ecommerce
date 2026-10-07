import {
  categoryId,
  categorySlugCandidates,
  createCategory,
  deleteCategory,
  InvalidIdentifierError,
  moveCategory,
  renameCategory,
  setCategoryHidden,
  setCategorySlug,
  slugHeldByOther,
  type CategoryId,
  type CategoryTree,
  type Slug,
  type SlugHolder,
} from '@ecommerce/domain';
import type { CreateCategoryInput, MoveCategoryInput } from '@ecommerce/application/client';
import { BusinessRuleError } from '../../errors';
import { requirePermission } from '../../ports/authorization';
import type { OperationContext } from '../../ports/operation-context';
import type { TransactionScope } from '../../ports/unit-of-work';
import { changeTree, translated, writtenSlug } from './shared';

// Las operaciones del árbol (FR-019 a FR-021a, FR-024). Cada una aplica la operación pura del
// dominio sobre el documento del árbol; ninguna escribe productos.

type Done = Record<string, never>;
const DONE: Done = {};

/**
 * Idempotente por `requestId`, como `CreateProduct`: el id de la categoría ES el requestId. La URL,
 * escrita o generada, no puede estar reservada por otra categoría que exista (T110).
 */
export class CreateCategory {
  static readonly requires = requirePermission('catalog.write');

  async execute(tx: TransactionScope, ctx: OperationContext, input: CreateCategoryInput): Promise<{ categoryId: CategoryId; slug: Slug }> {
    const id = idFromRequest(ctx.requestId);
    const written = input.slug === undefined ? undefined : writtenSlug(input.slug);
    // Todas las lecturas antes que cualquier escritura.
    const tree = await tx.categories.get();
    const existing = tree.nodes[id];
    if (existing) return { categoryId: id, slug: existing.slug };
    const { slug, heldBy } = written ? { slug: written, heldBy: await tx.categorySlugs.find(written) } : await freeSlug(tx, tree, input.name);
    const next = translated(() => createCategory(tree, { id, parentId: input.parentId, name: input.name, slug }, heldBy));
    await tx.categories.save(next);
    // Una reserva de una categoría eliminada ya no protege nada: se limpia.
    if (heldBy !== null) await tx.categorySlugs.release(slug);
    return { categoryId: id, slug: next.nodes[id]?.slug ?? createdWithout(id) };
  }
}

/** No cambia la URL (FR-021). */
export class RenameCategory {
  static readonly requires = requirePermission('catalog.write');

  async execute(tx: TransactionScope, _ctx: OperationContext, input: { readonly categoryId: CategoryId; readonly name: string }): Promise<Done> {
    return changeTree(tx, (tree) => ({ tree: renameCategory(tree, input.categoryId, input.name), result: DONE }));
  }
}

/**
 * La anterior queda reservada, fuera del árbol: el documento no crece con los cambios de URL (FR-021,
 * T110). Volver a una anterior propia la recupera.
 */
export class SetCategorySlug {
  static readonly requires = requirePermission('catalog.write');

  async execute(tx: TransactionScope, _ctx: OperationContext, input: { readonly categoryId: CategoryId; readonly slug: string }): Promise<{ slug: Slug }> {
    const next = writtenSlug(input.slug);
    const tree = await tx.categories.get();
    const heldBy = await tx.categorySlugs.find(next);
    const change = translated(() => setCategorySlug(tree, input.categoryId, next, heldBy));
    if (change.tree === tree) return { slug: next };
    await tx.categories.save(change.tree);
    if (change.release) await tx.categorySlugs.release(change.release);
    if (change.reserve) await tx.categorySlugs.reserve(change.reserve, input.categoryId);
    return { slug: next };
  }
}

/** Con sus hijas; no toca la visibilidad propia de nadie (FR-021a). Con el mismo padre, reordena. */
export class MoveCategory {
  static readonly requires = requirePermission('catalog.write');

  async execute(tx: TransactionScope, _ctx: OperationContext, input: MoveCategoryInput): Promise<Done> {
    return changeTree(tx, (tree) => ({ tree: moveCategory(tree, input.categoryId, input.parentId, input.position), result: DONE }));
  }
}

/** Escribe solo ese nodo: sus descendientes conservan cada uno la suya (FR-021a). */
export class SetCategoryHidden {
  static readonly requires = requirePermission('catalog.write');

  async execute(tx: TransactionScope, _ctx: OperationContext, input: { readonly categoryId: CategoryId; readonly hidden: boolean }): Promise<Done> {
    return changeTree(tx, (tree) => ({ tree: setCategoryHidden(tree, input.categoryId, input.hidden), result: DONE }));
  }
}

/**
 * Sin subcategorías (FR-024). Saca el nodo y deja su id en `pendingPrune`; los productos no se tocan
 * acá: la callable los poda después de confirmar (research §2).
 */
export class DeleteCategory {
  static readonly requires = requirePermission('catalog.write');

  async execute(tx: TransactionScope, _ctx: OperationContext, input: { readonly categoryId: CategoryId }): Promise<Done> {
    return changeTree(tx, (tree) => ({ tree: deleteCategory(tree, input.categoryId), result: DONE }));
  }
}

/** La primera candidata que no esté reservada por otra categoría que exista, y quién la tenía. */
async function freeSlug(tx: TransactionScope, tree: CategoryTree, name: string): Promise<{ slug: Slug; heldBy: SlugHolder }> {
  for (const candidate of categorySlugCandidates(tree, name)) {
    const heldBy = await tx.categorySlugs.find(candidate);
    if (!slugHeldByOther(tree, heldBy, null)) return { slug: candidate, heldBy };
  }
  throw new Error('inalcanzable');
}

function createdWithout(id: CategoryId): never {
  throw new Error(`La categoría ${id} no quedó en el árbol`);
}

function idFromRequest(requestId: string): CategoryId {
  try {
    return categoryId(requestId);
  } catch (error) {
    if (error instanceof InvalidIdentifierError) throw new BusinessRuleError('invalid-argument', 'requestId inválido');
    throw error;
  }
}

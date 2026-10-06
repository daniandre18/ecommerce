import {
  categoryId,
  createCategory,
  deleteCategory,
  InvalidIdentifierError,
  moveCategory,
  renameCategory,
  setCategoryHidden,
  setCategorySlug,
  type CategoryId,
  type Slug,
} from '@ecommerce/domain';
import { BusinessRuleError } from '../../errors';
import { requirePermission } from '../../ports/authorization';
import type { OperationContext } from '../../ports/operation-context';
import type { TransactionScope } from '../../ports/unit-of-work';
import { changeTree, writtenSlug } from './shared';

// Las operaciones del árbol (FR-019 a FR-021a, FR-024). Cada una aplica la operación pura del
// dominio sobre el documento del árbol; ninguna escribe productos.

type Done = Record<string, never>;
const DONE: Done = {};

export interface CreateCategoryInput {
  readonly parentId: CategoryId | null;
  readonly name: string;
  /** Escrita por el comercio; si falta, se genera del nombre con el menor sufijo libre (FR-021). */
  readonly slug?: string;
}

/** Idempotente por `requestId`, como `CreateProduct`: el id de la categoría ES el requestId. */
export class CreateCategory {
  static readonly requires = requirePermission('catalog.write');

  async execute(tx: TransactionScope, ctx: OperationContext, input: CreateCategoryInput): Promise<{ categoryId: CategoryId; slug: Slug }> {
    const id = idFromRequest(ctx.requestId);
    const chosen = input.slug === undefined ? undefined : writtenSlug(input.slug);
    return changeTree(tx, (tree) => {
      const existing = tree.nodes[id];
      if (existing) return { tree, result: { categoryId: id, slug: existing.slug } };
      const next = createCategory(tree, { id, parentId: input.parentId, name: input.name, ...(chosen ? { slug: chosen } : {}) });
      return { tree: next, result: { categoryId: id, slug: next.nodes[id]?.slug ?? createdWithout(id) } };
    });
  }
}

/** No cambia la URL (FR-021). */
export class RenameCategory {
  static readonly requires = requirePermission('catalog.write');

  async execute(tx: TransactionScope, _ctx: OperationContext, input: { readonly categoryId: CategoryId; readonly name: string }): Promise<Done> {
    return changeTree(tx, (tree) => ({ tree: renameCategory(tree, input.categoryId, input.name), result: DONE }));
  }
}

/** La anterior queda reservada (FR-021). */
export class SetCategorySlug {
  static readonly requires = requirePermission('catalog.write');

  async execute(tx: TransactionScope, _ctx: OperationContext, input: { readonly categoryId: CategoryId; readonly slug: string }): Promise<{ slug: Slug }> {
    const next = writtenSlug(input.slug);
    return changeTree(tx, (tree) => ({ tree: setCategorySlug(tree, input.categoryId, next), result: { slug: next } }));
  }
}

export interface MoveCategoryInput {
  readonly categoryId: CategoryId;
  readonly parentId: CategoryId | null;
  readonly position: number;
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

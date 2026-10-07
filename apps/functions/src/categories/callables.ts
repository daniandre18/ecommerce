import {
  AssignCategory,
  CreateCategory,
  DeleteCategory,
  MoveCategory,
  prunePendingCategories,
  RenameCategory,
  SetCategoryHidden,
  SetCategorySlug,
  SetProductCategories,
  UnassignCategory,
  type CategoryPruner,
} from '@ecommerce/application';
import type { TenantId } from '@ecommerce/domain';
import { callableFactory, type CallableDependencies } from '../bootstrap/callable';
import {
  parseBulkCategory,
  parseCreateCategory,
  parseDeleteCategory,
  parseMoveCategory,
  parseRenameCategory,
  parseSetCategoryHidden,
  parseSetCategorySlug,
  parseSetProductCategories,
} from '../bootstrap/parse';

export interface CategoryDependencies {
  /** La poda de las eliminadas, atada a un comercio como la unidad de trabajo. */
  readonly prunerFor: (tenantId: TenantId) => CategoryPruner;
}

/**
 * Las categorías (`specs/002-storefront-catalog/contracts/callable-functions.md`): todas exigen
 * `catalog.write` y ninguna escribe bitácora. Las del árbol, después de confirmar, podan de los
 * productos los ids de las eliminadas (research §2): si una poda se cortó, la próxima la termina.
 */
export function categoryCallables(deps: CallableDependencies & CategoryDependencies) {
  const defineCallable = callableFactory(deps);
  const prune = { after: (tenant: TenantId) => prunePendingCategories(deps.unitOfWorkFor(tenant), deps.prunerFor(tenant)) };
  return {
    createCategory: defineCallable('createCategory', CreateCategory, parseCreateCategory, prune),
    renameCategory: defineCallable('renameCategory', RenameCategory, parseRenameCategory, prune),
    setCategorySlug: defineCallable('setCategorySlug', SetCategorySlug, parseSetCategorySlug, prune),
    moveCategory: defineCallable('moveCategory', MoveCategory, parseMoveCategory, prune),
    setCategoryHidden: defineCallable('setCategoryHidden', SetCategoryHidden, parseSetCategoryHidden, prune),
    deleteCategory: defineCallable('deleteCategory', DeleteCategory, parseDeleteCategory, prune),
    setProductCategories: defineCallable('setProductCategories', SetProductCategories, parseSetProductCategories),
    assignCategory: defineCallable('assignCategory', AssignCategory, parseBulkCategory),
    unassignCategory: defineCallable('unassignCategory', UnassignCategory, parseBulkCategory),
  };
}

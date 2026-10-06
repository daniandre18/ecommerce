import type { LiveAnnouncer } from '@angular/cdk/a11y';
import type { CatalogCommands, CommandFailure } from '@ecommerce/application/client';
import { categoryPath, childrenOf, depthOf, descendantsOf, MAX_CATEGORIES, MAX_CATEGORY_DEPTH, type CategoryId, type CategoryNode, type CategoryTree, type TenantId } from '@ecommerce/domain';
import { commandErrorMessage } from '../../shared/command-errors';

const LIMITS: Record<string, string> = {
  depth: `Con sus subcategorías quedaría a más de ${MAX_CATEGORY_DEPTH} niveles.`,
  cycle: 'Una categoría no puede quedar dentro de sí misma ni de sus subcategorías.',
  count: `Llegaste al tope de ${MAX_CATEGORIES.toLocaleString('es')} categorías.`,
};

/** Lo que se le dice a la persona cuando el servidor rechaza una operación del árbol. */
export function categoryErrorMessage(failure: CommandFailure): string {
  if (failure.code === 'category-limit') {
    const reason = (failure.details as { reason?: string } | undefined)?.reason;
    return LIMITS[reason ?? ''] ?? commandErrorMessage(failure.code);
  }
  if (failure.code === 'slug-conflict') return 'Esa URL ya la usa otra categoría, o está reservada.';
  return commandErrorMessage(failure.code);
}

/** "Ropa › Hombre › Camisetas". */
export function pathLabel(tree: CategoryTree, id: CategoryId): string {
  return categoryPath(tree, id)
    .map((node) => node.name)
    .join(' › ');
}

/** Todas, en el orden en que se leen: cada una seguida de sus subcategorías. */
export function inTreeOrder(tree: CategoryTree, parentId: CategoryId | null = null): CategoryNode[] {
  return childrenOf(tree, parentId).flatMap((node) => [node, ...inTreeOrder(tree, node.id)]);
}

/** ¿Puede quedar dentro de `parentId`? Ni en su rama, ni a más de tres niveles con sus hijas (FR-019). */
export function canMoveInto(tree: CategoryTree, id: CategoryId, parentId: CategoryId | null): boolean {
  if (parentId === null) return true;
  if (parentId === id || descendantsOf(tree, id).includes(parentId)) return false;
  return depthOf(tree, parentId) + heightOf(tree, id) <= MAX_CATEGORY_DEPTH;
}

function heightOf(tree: CategoryTree, id: CategoryId): number {
  return 1 + Math.max(0, ...childrenOf(tree, id).map((child) => heightOf(tree, child.id)));
}

/**
 * Mueve y lo anuncia: arrastrar no se oye, así que quien usa un lector de pantalla se entera por acá
 * de dónde quedó (WCAG 4.1.3).
 */
export async function moveAndAnnounce(
  deps: { readonly commands: CatalogCommands; readonly announcer: LiveAnnouncer },
  tenantId: TenantId,
  tree: CategoryTree,
  move: { readonly categoryId: CategoryId; readonly parentId: CategoryId | null; readonly position: number },
): Promise<CommandFailure | null> {
  const result = await deps.commands.moveCategory(tenantId, move);
  if (!result.ok) return result;
  void deps.announcer.announce(movedMessage(tree, move));
  return null;
}

function movedMessage(tree: CategoryTree, { categoryId, parentId, position }: { categoryId: CategoryId; parentId: CategoryId | null; position: number }): string {
  const name = tree.nodes[categoryId]?.name ?? '';
  const parent = parentId === null ? null : (tree.nodes[parentId]?.name ?? '');
  if (tree.nodes[categoryId]?.parentId === parentId) {
    return `«${name}» quedó en el lugar ${position + 1} ${parent === null ? 'del primer nivel' : `de «${parent}»`}.`;
  }
  return parent === null ? `«${name}» quedó en el primer nivel.` : `«${name}» quedó dentro de «${parent}».`;
}

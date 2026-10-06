import {
  addToSection,
  MAX_SECTION_PRODUCTS,
  removeFromSection,
  SectionFullError,
  type FeaturedSections,
  type ProductId,
  type SectionId,
} from '@ecommerce/domain';
import { BusinessRuleError } from '../../errors';
import { requirePermission } from '../../ports/authorization';
import type { OperationContext } from '../../ports/operation-context';
import type { TransactionScope } from '../../ports/unit-of-work';
import { loadProduct } from '../shared';

// Destacados y Ofertas (FR-027 a FR-027c). Son decisiones de catálogo: `catalog.write`, sin bitácora
// y sin permiso de precios. El tope lo hace cumplir la transacción sobre el documento de secciones
// (research §4): se lee y se escribe la misma lista, así que dos agregados a la vez se serializan.

export interface SectionInput {
  readonly section: SectionId;
  readonly productIds: readonly ProductId[];
}

export interface SectionOutput {
  readonly section: SectionId;
  /** Cuántos lugares ocupa la sección ahora: el contador "33 de 40". */
  readonly count: number;
}

/** Si no hay lugar para todos, se rechaza entero y se dice cuántos lugares quedan (FR-027b). */
export class AddToSection {
  static readonly requires = requirePermission('catalog.write');

  async execute(tx: TransactionScope, _ctx: OperationContext, input: SectionInput): Promise<SectionOutput> {
    const ids = validIds(input.productIds);
    // Todas las lecturas antes que cualquier escritura.
    const sections = await tx.sections.get();
    const products = await Promise.all(ids.map((id) => loadProduct(tx, id)));
    const archived = products.filter((product) => product.archived).map((product) => product.id);
    if (archived.length > 0) {
      throw new BusinessRuleError('invalid-argument', 'Un producto archivado no puede estar en una sección', { productIds: archived });
    }

    const list = sections[input.section];
    let next: ProductId[];
    try {
      next = addToSection(list, ids);
    } catch (error) {
      if (error instanceof SectionFullError) {
        throw new BusinessRuleError('section-full', error.message, { section: input.section, remaining: error.remaining, requested: error.requested });
      }
      throw error;
    }
    if (next.length !== list.length) await tx.sections.save(withList(sections, input.section, next));
    return { section: input.section, count: next.length };
  }
}

/** Saca de la sección los que estén; los que no, se ignoran (FR-027c). */
export class RemoveFromSection {
  static readonly requires = requirePermission('catalog.write');

  async execute(tx: TransactionScope, _ctx: OperationContext, input: SectionInput): Promise<SectionOutput> {
    const ids = validIds(input.productIds);
    const sections = await tx.sections.get();
    const list = sections[input.section];
    const next = removeFromSection(list, ids);
    if (next.length !== list.length) await tx.sections.save(withList(sections, input.section, next));
    return { section: input.section, count: next.length };
  }
}

/** Al menos uno, y no más de los que entran en una sección. */
function validIds(productIds: readonly ProductId[]): ProductId[] {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) throw new BusinessRuleError('invalid-argument', 'No hay productos seleccionados');
  if (ids.length > MAX_SECTION_PRODUCTS) {
    throw new BusinessRuleError('limit-exceeded', `Una sección admite hasta ${MAX_SECTION_PRODUCTS} productos`, {
      max: MAX_SECTION_PRODUCTS,
      actual: ids.length,
    });
  }
  return ids;
}

const withList = (sections: FeaturedSections, section: SectionId, list: readonly ProductId[]): FeaturedSections => ({ ...sections, [section]: list });

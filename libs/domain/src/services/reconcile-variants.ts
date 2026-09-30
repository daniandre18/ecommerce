import type { VariationOption } from '../entities/product';
import { createIncompleteVariant, hasVariantData, type Combination, type Variant } from '../entities/variant';
import type { OptionId, ProductId, TenantId, ValueId, VariantId } from '../value-objects/ids';
import { err, ok, type Result } from '../result';
import { byPosition, generateCombinations } from './generate-combinations';

/** Valor de una opción nueva para una variante que ya existía (FR-024). */
export interface Assignment {
  readonly variantId: VariantId;
  readonly optionId: OptionId;
  readonly valueId: ValueId;
}

export interface Reconciliation {
  /** Siguen en circulación con todos sus datos intactos; solo puede cambiar su combinación. */
  readonly preserved: readonly Variant[];
  /** Combinaciones nuevas: sin SKU, sin precio y sin existencias definidas (FR-024, FR-029). */
  readonly created: readonly Variant[];
  /** Salen de circulación con sus datos, y su SKU queda reservado (FR-023). */
  readonly archived: readonly Variant[];
  /**
   * Variantes sin ningún dato: no tienen SKU que reservar ni entradas de bitácora que las nombren,
   * así que se eliminan en lugar de quedar archivadas con una combinación que ya no existe.
   */
  readonly discarded: readonly VariantId[];
}

export type ReconciliationError = { readonly kind: 'missing-assignments'; readonly variantIds: readonly VariantId[] };

export interface ReconcileInput {
  readonly product: { readonly id: ProductId; readonly tenantId: TenantId };
  /** Variantes actuales del producto. Las archivadas se ignoran: están fuera de circulación. */
  readonly current: readonly Variant[];
  /** Opciones antes del cambio: hacen falta para decidir qué variante sobrevive a una fusión. */
  readonly previousOptions: readonly VariationOption[];
  /** Opciones después del cambio. Mismo id es la misma opción, aunque cambie de nombre (FR-026). */
  readonly options: readonly VariationOption[];
  /** Para cada opción nueva, el valor de cada variante existente con datos (FR-024). */
  readonly assignments: readonly Assignment[];
  readonly newVariantId: () => VariantId;
}

/**
 * Reconcilia las variantes de un producto con una nueva estructura de opciones. Núcleo de la
 * feature: el comerciante cambia opciones y valores, y nada de lo que cargó se pierde en silencio.
 *
 * 1. Quitar un valor en uso saca de circulación sus variantes (FR-026).
 * 2. Quitar una opción entera fusiona las variantes que pasan a coincidir: sobrevive la que tiene
 *    datos y, entre iguales, la del primer valor de la opción quitada.
 * 3. Agregar una opción exige el valor de cada variante existente con datos (FR-024). Si falta
 *    alguno, falla sin resultados parciales y dice cuáles.
 * 4. Las combinaciones que quedan sin cubrir nacen como variantes incompletas.
 */
export function reconcileVariants(input: ReconcileInput): Result<Reconciliation, ReconciliationError> {
  const kept = new Map(input.options.map((option) => [option.id, option]));
  const previousIds = new Set(input.previousOptions.map((option) => option.id));
  const added = input.options.filter((option) => !previousIds.has(option.id));
  const removed = input.previousOptions.filter((option) => !kept.has(option.id)).sort(byPosition);

  const archived: Variant[] = [];
  const discarded: VariantId[] = [];
  const retire = (variant: Variant) =>
    hasVariantData(variant) ? archived.push({ ...variant, archived: true }) : discarded.push(variant.id);

  const live = input.current.filter((variant) => !variant.archived);
  const [withValidValues, withRemovedValue] = partition(live, (variant) => !usesRemovedValue(variant, kept));
  withRemovedValue.forEach(retire);

  const survivors = mergeCollisions(withValidValues, kept, removed, retire);

  const assigned = validAssignments(input.assignments, added);
  const extended = survivors.map((variant) => ({ variant, extension: newOptionValues(variant.id, added, assigned) }));
  const missing = extended.filter(({ variant, extension }) => extension === null && hasVariantData(variant));
  if (missing.length > 0) {
    return err({ kind: 'missing-assignments', variantIds: missing.map(({ variant }) => variant.id) });
  }

  const preserved: Variant[] = [];
  for (const { variant, extension } of extended) {
    if (extension === null) discarded.push(variant.id); // sin datos y sin asignar
    else preserved.push({ ...variant, optionValues: { ...project(variant.optionValues, kept), ...extension } });
  }

  const covered = new Set(preserved.map((variant) => combinationKey(variant.optionValues)));
  const created = generateCombinations(input.options)
    .filter((combination) => !covered.has(combinationKey(combination)))
    .map((optionValues) =>
      createIncompleteVariant({
        id: input.newVariantId(),
        tenantId: input.product.tenantId,
        productId: input.product.id,
        optionValues,
      }),
    );

  return ok({ preserved, created, archived, discarded });
}

function usesRemovedValue(variant: Variant, kept: ReadonlyMap<OptionId, VariationOption>): boolean {
  return entries(variant.optionValues).some(([optionId, valueId]) => {
    const option = kept.get(optionId);
    return option !== undefined && !option.values.some((value) => value.id === valueId);
  });
}

/** Agrupa por la combinación que queda sin las opciones quitadas; de cada grupo sobrevive una. */
function mergeCollisions(
  variants: readonly Variant[],
  kept: ReadonlyMap<OptionId, VariationOption>,
  removed: readonly VariationOption[],
  retire: (variant: Variant) => void,
): Variant[] {
  const groups = new Map<string, Variant[]>();
  for (const variant of variants) {
    const key = combinationKey(project(variant.optionValues, kept));
    groups.set(key, [...(groups.get(key) ?? []), variant]);
  }

  const survivors: Variant[] = [];
  for (const group of groups.values()) {
    const [survivor, ...others] = [...group].sort(survivalOrder(removed));
    if (survivor) survivors.push(survivor);
    others.forEach(retire);
  }
  return survivors;
}

/** Primero las que tienen datos; entre iguales, la del primer valor de las opciones quitadas. */
function survivalOrder(removed: readonly VariationOption[]) {
  const rank = (variant: Variant) =>
    removed.map((option) => option.values.find((value) => value.id === variant.optionValues[option.id])?.position ?? Infinity);

  return (a: Variant, b: Variant) => {
    const byData = Number(hasVariantData(b)) - Number(hasVariantData(a));
    if (byData !== 0) return byData;
    const [rankA, rankB] = [rank(a), rank(b)];
    const index = rankA.findIndex((position, i) => position !== rankB[i]);
    return index === -1 ? 0 : (rankA[index] ?? 0) - (rankB[index] ?? 0);
  };
}

/** Solo cuentan las asignaciones a una opción nueva con un valor que exista en ella. */
function validAssignments(assignments: readonly Assignment[], added: readonly VariationOption[]): Map<string, ValueId> {
  const valid = new Map<string, ValueId>();
  for (const assignment of assignments) {
    const option = added.find((candidate) => candidate.id === assignment.optionId);
    if (option?.values.some((value) => value.id === assignment.valueId)) {
      valid.set(assignmentKey(assignment.variantId, assignment.optionId), assignment.valueId);
    }
  }
  return valid;
}

/** El valor de cada opción nueva para la variante, o `null` si falta alguno. */
function newOptionValues(
  variantId: VariantId,
  added: readonly VariationOption[],
  assigned: ReadonlyMap<string, ValueId>,
): Record<OptionId, ValueId> | null {
  const values: Record<OptionId, ValueId> = {};
  for (const option of added) {
    const valueId = assigned.get(assignmentKey(variantId, option.id));
    if (valueId === undefined) return null;
    values[option.id] = valueId;
  }
  return values;
}

function project(combination: Combination, kept: ReadonlyMap<OptionId, VariationOption>): Combination {
  return Object.fromEntries(entries(combination).filter(([optionId]) => kept.has(optionId)));
}

function combinationKey(combination: Combination): string {
  return JSON.stringify(entries(combination).sort(([a], [b]) => a.localeCompare(b)));
}

const assignmentKey = (variantId: VariantId, optionId: OptionId) => `${variantId}\u0000${optionId}`;

const entries = (combination: Combination) => Object.entries(combination) as [OptionId, ValueId][];

function partition<T>(items: readonly T[], predicate: (item: T) => boolean): [T[], T[]] {
  const yes: T[] = [];
  const no: T[] = [];
  for (const item of items) (predicate(item) ? yes : no).push(item);
  return [yes, no];
}

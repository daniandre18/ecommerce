import {
  byPosition,
  MAX_COMBINATIONS,
  MAX_OPTIONS,
  optionId,
  validateOptionLimits,
  validateOptionStructure,
  valueId,
  type OptionLimitExceeded,
  type OptionStructureError,
  type VariationOption,
} from '@ecommerce/domain';

// El editor trabaja sobre un borrador plano —textos e ids— y recién al guardar lo convierte en la
// estructura del dominio. La posición de cada opción y de cada valor es su lugar en la lista.

export interface DraftValue {
  readonly id: string;
  readonly label: string;
}

export interface DraftOption {
  readonly id: string;
  readonly name: string;
  readonly values: readonly DraftValue[];
}

export interface OptionsDraft {
  readonly options: readonly DraftOption[];
}

/** Los ids de opciones y valores nuevos los propone el cliente (contrato de `setProductOptions`). */
export const newId = (): string => crypto.randomUUID();

export const emptyOption = (): DraftOption => ({ id: newId(), name: '', values: [{ id: newId(), label: '' }] });

export function draftFrom(options: readonly VariationOption[]): OptionsDraft {
  return {
    options: [...options].sort(byPosition).map((option) => ({
      id: option.id,
      name: option.name,
      values: [...option.values].sort(byPosition).map((value) => ({ id: value.id, label: value.label })),
    })),
  };
}

export function toVariationOptions(draft: OptionsDraft): VariationOption[] {
  return draft.options.map((option, position) => ({
    id: optionId(option.id),
    name: option.name.trim(),
    position,
    values: option.values.map((value, valuePosition) => ({ id: valueId(value.id), label: value.label.trim(), position: valuePosition })),
  }));
}

/** Mismo contenido, en el mismo orden. Para saber si hay cambios sin guardar. */
export function sameDraft(a: OptionsDraft, b: OptionsDraft): boolean {
  return JSON.stringify(a.options) === JSON.stringify(b.options);
}

/** El primer problema de la estructura según el dominio, en palabras, o `undefined` si no hay. */
export function draftProblem(options: readonly VariationOption[]): string | undefined {
  const structure = validateOptionStructure(options);
  if (!structure.ok) return structureMessage(structure.error);
  const limits = validateOptionLimits(options);
  if (!limits.ok) return limitMessage(limits.error);
  return undefined;
}

export function combinationCount(options: readonly VariationOption[]): number {
  return options.reduce((count, option) => count * Math.max(option.values.length, 1), 1);
}

function structureMessage(error: OptionStructureError): string {
  switch (error.kind) {
    case 'empty-option-name':
      return 'Cada opción necesita un nombre';
    case 'duplicate-option':
      return `Hay dos opciones llamadas «${error.name}»`;
    case 'option-without-values':
      return `La opción «${error.option}» necesita al menos un valor`;
    case 'empty-value-label':
      return `La opción «${error.option}» tiene un valor vacío`;
    case 'duplicate-value':
      return `La opción «${error.option}» repite el valor «${error.label}»`;
    case 'duplicate-id':
      return 'Hay dos elementos con el mismo identificador. Recargá la página';
  }
}

function limitMessage(error: OptionLimitExceeded): string {
  return error.kind === 'too-many-options'
    ? `Un producto admite hasta ${MAX_OPTIONS} opciones`
    : `Estas opciones producirían ${error.actual} combinaciones; el máximo es ${MAX_COMBINATIONS}`;
}

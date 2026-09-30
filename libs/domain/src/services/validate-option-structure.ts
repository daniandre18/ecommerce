import type { VariationOption } from '../entities/product';
import { err, ok, type Result } from '../result';

export type OptionStructureError =
  | { readonly kind: 'empty-option-name' }
  | { readonly kind: 'duplicate-option'; readonly name: string }
  | { readonly kind: 'option-without-values'; readonly option: string }
  | { readonly kind: 'empty-value-label'; readonly option: string }
  | { readonly kind: 'duplicate-value'; readonly option: string; readonly label: string };

/** "Rojo", "rojo" y " Rojo " son el mismo valor, y también las dos formas Unicode de "Café". */
const comparable = (text: string) => text.normalize('NFC').trim().toLocaleLowerCase();

/**
 * Estructura válida de opciones (FR-022): nombres y etiquetas no vacíos y sin repetir. Una opción
 * sin valores se rechaza porque su producto cartesiano es vacío: el producto quedaría sin ninguna
 * variante, contra FR-020.
 */
export function validateOptionStructure(options: readonly VariationOption[]): Result<void, OptionStructureError> {
  const seenNames = new Set<string>();
  for (const option of options) {
    const name = option.name.trim();
    if (name === '') return err({ kind: 'empty-option-name' });
    if (seenNames.has(comparable(name))) return err({ kind: 'duplicate-option', name });
    seenNames.add(comparable(name));

    const valueError = validateValues(option, name);
    if (valueError) return err(valueError);
  }
  return ok(undefined);
}

function validateValues(option: VariationOption, name: string): OptionStructureError | null {
  if (option.values.length === 0) return { kind: 'option-without-values', option: name };
  const seenLabels = new Set<string>();
  for (const value of option.values) {
    const label = value.label.trim();
    if (label === '') return { kind: 'empty-value-label', option: name };
    if (seenLabels.has(comparable(label))) return { kind: 'duplicate-value', option: name, label };
    seenLabels.add(comparable(label));
  }
  return null;
}

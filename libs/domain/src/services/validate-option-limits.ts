import { MAX_COMBINATIONS, MAX_OPTIONS, type VariationOption } from '../entities/product';
import { err, ok, type Result } from '../result';

export type OptionLimitExceeded =
  | { readonly kind: 'too-many-options'; readonly max: number; readonly actual: number }
  | { readonly kind: 'too-many-combinations'; readonly max: number; readonly actual: number };

/**
 * Topes de FR-025, evaluados ANTES de generar nada: informa cuántas combinaciones produciría la
 * estructura, para que la interfaz pueda decirlo en lugar de solo rechazar.
 */
export function validateOptionLimits(options: readonly VariationOption[]): Result<void, OptionLimitExceeded> {
  if (options.length > MAX_OPTIONS) {
    return err({ kind: 'too-many-options', max: MAX_OPTIONS, actual: options.length });
  }
  const combinations = options.reduce((count, option) => count * option.values.length, 1);
  if (combinations > MAX_COMBINATIONS) {
    return err({ kind: 'too-many-combinations', max: MAX_COMBINATIONS, actual: combinations });
  }
  return ok(undefined);
}
